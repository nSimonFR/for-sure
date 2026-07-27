// Merchant-name normalisation.
//
// WHY THIS EXISTS
//
// Sure derives a provider merchant's identity from the name we send:
//
//   provider_merchant_id = "lunchflow_merchant_" + md5(merchant.downcase)
//
// (see Sure's app/models/lunchflow_entry/processor.rb). It then looks the
// merchant up by that id, falling back to an exact name match. So two payloads
// that differ by a store number or a legal-form prefix — "Franprix 5260" vs
// "Franprix", "Sas Keralan" vs "Keralan" — become two separate merchants, and
// the user's transaction history fragments across them. Measured on the live
// dataset: 790 merchants from this connector, of which a large share were
// near-duplicates of one another.
//
// Sure cannot fix this: it only ever sees the string we hand it. The canonical
// name has to be decided here, at the source.
//
// DESIGN RULES
//
// 1. Every transform is GUARDED: if the result would be blank, too short, or
//    strip away the only meaningful word, the previous value is kept. A bad
//    normalisation silently merges unrelated merchants, which is far worse than
//    leaving a duplicate — so every rule fails closed.
// 2. Case is deliberately NOT normalised. Sure hashes the lowercased name, so
//    case variants already collapse; changing case would only churn ids.
// 3. Payment-processor prefixes ("Sum Up *", "Shotgun*", "Discord*") are
//    deliberately NOT stripped. Distinct businesses share a processor —
//    "Sum Up *Ay Simo" and "Sum Up *Chick N House" are two different
//    restaurants — so collapsing them would destroy real identity.
// 4. "Cashback " is deliberately NOT stripped. Cashback is a distinct money
//    flow from a purchase at the same brand, and conflating them would coarsen
//    the ledger.

/** Minimum length of a normalised name before we consider it degenerate. */
const MIN_LENGTH = 3;

/**
 * Leading legal forms, as whole tokens. `\b` keeps "Steda" and "Sncf" safe —
 * only a real token boundary matches.
 */
const LEGAL_FORM_PREFIX = /^(s\.?a\.?s\.?u?|sarl|sasu|sci|snc|eurl|ste|sc|sn|sa)\b[.\s]+/i;

/** A trailing store / branch / year number, e.g. "Franprix 5260". */
const TRAILING_NUMBER = /\s+\d{2,}$/;

/** A trailing date, e.g. "Uber 17/01" or "Uber 17/01/2024". */
const TRAILING_DATE = /\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?$/;

/** A trailing quantity marker, e.g. "Top 100 US Tech Stocks * 4.94053113". */
const TRAILING_QUANTITY = /\s*\*\s*\d+([.,]\d+)?$/;

/** Does the candidate still carry a real word (>= 3 letters)? */
function hasMeaningfulWord(value: string): boolean {
  return /[\p{L}]{3,}/u.test(value);
}

/**
 * Accept `candidate` only if it is still a plausible merchant name, otherwise
 * fall back to `previous`. This is the single place the "fail closed" rule of
 * the module header is enforced.
 */
function keepIfSane(candidate: string, previous: string): string {
  const trimmed = candidate.trim();
  if (trimmed.length < MIN_LENGTH) return previous;
  if (!hasMeaningfulWord(trimmed)) return previous;
  return trimmed;
}

/** Collapse runs of whitespace and trim. */
function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Produce the canonical merchant name for a raw connector string.
 *
 * Idempotent: normalising an already-normalised name returns it unchanged.
 * Returns the input (squashed) when no rule applies or every rule is rejected
 * by its guard.
 */
export function normalizeMerchantName(raw: string): string {
  let name = squash(raw ?? "");
  if (!name) return "";

  // Order matters: quantity and date markers sit outside the store number, so
  // they have to come off first for TRAILING_NUMBER to see a clean tail.
  name = keepIfSane(name.replace(TRAILING_QUANTITY, ""), name);
  name = keepIfSane(name.replace(TRAILING_DATE, ""), name);
  name = keepIfSane(name.replace(TRAILING_NUMBER, ""), name);

  // Legal forms can stack ("Sas Sci Foo"); strip them one token at a time and
  // stop as soon as a guard rejects, so we never eat the whole name.
  for (;;) {
    if (!LEGAL_FORM_PREFIX.test(name)) break;
    const stripped = keepIfSane(name.replace(LEGAL_FORM_PREFIX, ""), name);
    if (stripped === name) break;
    name = stripped;
  }

  return squash(name);
}

/**
 * Convenience wrapper for a transaction-shaped object. Leaves every other
 * field untouched and never introduces an empty merchant.
 */
export function normalizeTransactionMerchant<T extends { merchant: string }>(tx: T): T {
  const merchant = normalizeMerchantName(tx.merchant);
  return merchant && merchant !== tx.merchant ? { ...tx, merchant } : tx;
}
