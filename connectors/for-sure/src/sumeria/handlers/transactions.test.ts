import assert from "node:assert/strict";
import { test } from "node:test";
import { isPendingStatus } from "./transactions.js";

// Every status below is a real value observed on the live Sumeria accounts
// (192264 + 357390, 2026-08): done 928, settled 53, reversed 9, pending 9.

test("final statuses are not pending", () => {
  assert.equal(isPendingStatus("done"), false);
  assert.equal(isPendingStatus("settled"), false);
  assert.equal(isPendingStatus("completed"), false);
});

// The regression this file exists for: `reversed` is a CANCELLED card
// authorisation — final, not in-flight. The old deny-list marked it pending
// forever, and a stuck-pending row is a hijack target for Sure's
// amount-only pending→posted reconciler.
test("reversed is final, not pending", () => {
  assert.equal(isPendingStatus("reversed"), false);
});

test("in-flight statuses are pending", () => {
  assert.equal(isPendingStatus("pending"), true);
  assert.equal(isPendingStatus("processing"), true);
  assert.equal(isPendingStatus("authorized"), true);
});

// Polarity guard: an unknown status must default to SETTLED. Wrongly-settled is
// cosmetic (no pending badge); wrongly-pending makes the row claimable by any
// same-amount transaction within 8 days, which silently rewrites it.
test("an unknown status defaults to settled", () => {
  assert.equal(isPendingStatus("some_status_sumeria_added_later"), false);
  assert.equal(isPendingStatus(""), false);
  assert.equal(isPendingStatus(undefined), false);
  assert.equal(isPendingStatus(null), false);
});

test("status matching is case- and whitespace-insensitive", () => {
  assert.equal(isPendingStatus("PENDING"), true);
  assert.equal(isPendingStatus("  Pending  "), true);
  assert.equal(isPendingStatus("Reversed"), false);
});
