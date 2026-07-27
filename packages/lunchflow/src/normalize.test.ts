import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMerchantName, normalizeTransactionMerchant } from "./normalize.js";

// Every case below is a real merchant string taken from the live dataset.

test("strips a trailing store number", () => {
  assert.equal(normalizeMerchantName("Franprix 5260"), "Franprix");
  assert.equal(normalizeMerchantName("Picard 1083"), "Picard");
  assert.equal(normalizeMerchantName("DECATHLON 0243"), "DECATHLON");
  assert.equal(normalizeMerchantName("Mcdonalds 77"), "Mcdonalds");
  assert.equal(normalizeMerchantName("NATURE ET DECOU 4341615"), "NATURE ET DECOU");
  assert.equal(normalizeMerchantName("1Password 2020"), "1Password");
});

test("strips a leading legal form", () => {
  assert.equal(normalizeMerchantName("Sas Keralan"), "Keralan");
  assert.equal(normalizeMerchantName("S.a.s Zac"), "Zac");
  assert.equal(normalizeMerchantName("Sc Boul Karmano"), "Boul Karmano");
  assert.equal(normalizeMerchantName("Sn Commerce Sain"), "Commerce Sain");
  assert.equal(normalizeMerchantName("Sa Bagel France"), "Bagel France");
});

test("strips a legal form and a store number together", () => {
  assert.equal(normalizeMerchantName("Sas Calao 172"), "Calao");
  assert.equal(normalizeMerchantName("Picard Sa 0473"), "Picard Sa");
});

test("strips a trailing quantity marker", () => {
  assert.equal(
    normalizeMerchantName("Top 100 US Tech Stocks * 4.94053113"),
    "Top 100 US Tech Stocks",
  );
  assert.equal(
    normalizeMerchantName("Top 100 US Tech Stocks * 0.38989028"),
    "Top 100 US Tech Stocks",
  );
});

test("strips a trailing date", () => {
  assert.equal(normalizeMerchantName("Uber 17/01"), "Uber");
  assert.equal(normalizeMerchantName("Uber 17/01/2024"), "Uber");
});

test("collapses whitespace", () => {
  assert.equal(normalizeMerchantName("  Camion   Qui  Fume  "), "Camion Qui Fume");
});

// ---------------------------------------------------------------------------
// Guards. These are the cases where a naive implementation destroys data.
// ---------------------------------------------------------------------------

test("keeps names that are only a stopword plus a number", () => {
  // Real bars. Stripping the number leaves "Le", which is not a merchant.
  assert.equal(normalizeMerchantName("Le 34"), "Le 34");
  assert.equal(normalizeMerchantName("Le 138"), "Le 138");
  assert.equal(normalizeMerchantName("Le 17 45"), "Le 17 45");
});

test("does not strip payment-processor prefixes", () => {
  // Distinct businesses share a processor: collapsing them would merge three
  // unrelated restaurants into one.
  assert.equal(normalizeMerchantName("Sum Up *Ay Simo"), "Sum Up *Ay Simo");
  assert.equal(normalizeMerchantName("Sum Up *Chick N House"), "Sum Up *Chick N House");
  assert.equal(normalizeMerchantName("Shotgun* Rock En Seine"), "Shotgun* Rock En Seine");
});

test("does not strip the Cashback prefix", () => {
  // Cashback is a different money flow from a purchase at the same brand.
  assert.equal(normalizeMerchantName("Cashback franprix 5260"), "Cashback franprix");
  assert.notEqual(normalizeMerchantName("Cashback Lydia"), normalizeMerchantName("Lydia"));
});

test("does not change case", () => {
  // Sure hashes the lowercased name, so case variants already collapse.
  assert.equal(normalizeMerchantName("AMAZON PAYMENTS"), "AMAZON PAYMENTS");
  assert.equal(normalizeMerchantName("mcdonald's"), "mcdonald's");
});

test("leaves legal-form lookalikes alone", () => {
  // Token boundary: these merely start with the same letters.
  assert.equal(normalizeMerchantName("Steda"), "Steda");
  assert.equal(normalizeMerchantName("Sncf Voyages"), "Sncf Voyages");
  assert.equal(normalizeMerchantName("Sadji Distributi"), "Sadji Distributi");
});

test("handles blank and degenerate input", () => {
  assert.equal(normalizeMerchantName(""), "");
  assert.equal(normalizeMerchantName("   "), "");
  assert.equal(normalizeMerchantName("42"), "42");
  assert.equal(normalizeMerchantName("Sas"), "Sas");
});

test("is idempotent", () => {
  for (const raw of [
    "Franprix 5260",
    "Sas Calao 172",
    "Top 100 US Tech Stocks * 4.94053113",
    "Le 34",
    "Sum Up *Ay Simo",
    "",
  ]) {
    const once = normalizeMerchantName(raw);
    assert.equal(normalizeMerchantName(once), once, `not idempotent for ${JSON.stringify(raw)}`);
  }
});

// ---------------------------------------------------------------------------
// The point of the whole exercise: variants must converge on one identity.
// ---------------------------------------------------------------------------

test("collapses real-world duplicate pairs onto one name", () => {
  const pairs: [string, string][] = [
    ["Franprix 5260", "Franprix"],
    ["Picard 1083", "Picard"],
    ["1Password 2020", "1Password 2021"],
    ["Sas Keralan", "Keralan"],
    ["Top 100 US Tech Stocks * 7.35634988", "Top 100 US Tech Stocks * 0.48928919"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(
      normalizeMerchantName(a),
      normalizeMerchantName(b),
      `${JSON.stringify(a)} and ${JSON.stringify(b)} should converge`,
    );
  }
});

test("keeps genuinely different merchants apart", () => {
  const pairs: [string, string][] = [
    ["Sum Up *Ay Simo", "Sum Up *Be Tomorrow"],
    ["Le 34", "Le 138"],
    ["Fleur D'eden", "Eden Restaurant"],
    ["Cashback Lydia", "Lydia"],
    ["Renine Sc1", "Renine Sc2"],
  ];
  for (const [a, b] of pairs) {
    assert.notEqual(
      normalizeMerchantName(a),
      normalizeMerchantName(b),
      `${JSON.stringify(a)} and ${JSON.stringify(b)} must stay distinct`,
    );
  }
});

test("normalizeTransactionMerchant preserves every other field", () => {
  const tx = {
    id: "abc",
    merchant: "Franprix 5260",
    date: "2026-07-01",
    amount: -12.5,
    currency: "EUR",
    isPending: false,
  };
  assert.deepEqual(normalizeTransactionMerchant(tx), { ...tx, merchant: "Franprix" });
});

test("normalizeTransactionMerchant returns the same object when unchanged", () => {
  const tx = { id: "abc", merchant: "Franprix" };
  assert.equal(normalizeTransactionMerchant(tx), tx);
});
