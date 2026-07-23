import { getTransactions as fetchTransactions } from "../client.js";
import type { LunchflowTransaction } from "@for-sure/lunchflow/types";
import type { SumeriaTransaction } from "../types.js";

// Transaction types where `title` is a genuine merchant name (e.g. "Apple",
// "Orange", "Fitness Park"): card payments and SEPA direct debits. For every
// OTHER type (P2P, incoming transfers, card refunds, ATM withdrawals, fees)
// `title` is free-text the user typed — an emoji, a gift note, a person's name —
// and must NOT be turned into a merchant, or Sure ends up with one junk merchant
// per note. There we use the structured counterparty instead.
const MERCHANT_TITLE_TYPES = new Set([
  "lydia_card_marqeta_payment",
  "lydia_iban_direct_debit",
]);

// Resolve the merchant name and an optional note for one Sumeria transaction.
//
// - Card payment / direct debit: `title` IS the merchant.
// - Everything else: the merchant is the counterparty — the party on the OTHER
//   side of the flow. For a debit (amount < 0) that's the receiver; for a credit
//   (amount > 0) that's the emitter. The free-text `title` is kept as the note.
//
// The counterparty is a real, de-duplicating name (a business like "Deliveroo",
// a person like "Mathias Ducancel", or — for internal moves — an own-account
// name), so the merchants list stops filling up with per-transaction noise.
export function resolveMerchant(t: SumeriaTransaction): {
  merchant: string;
  description?: string;
} {
  const title = (t.title ?? "").trim();

  if (MERCHANT_TITLE_TYPES.has(t.type)) {
    return { merchant: title };
  }

  const counterparty = ((t.amount < 0 ? t.receiver?.name : t.emitter?.name) ?? "").trim();

  return {
    // Fall back to `title` only when there is genuinely no counterparty, so a
    // transaction never ends up nameless ("Unknown transaction") in Sure.
    merchant: counterparty || title,
    // Preserve the user's free-text note (only meaningful for non-merchant types,
    // where it differs from the merchant we just picked).
    description: title && title !== counterparty ? title : undefined,
  };
}

export async function getTransactions(accountId: string): Promise<LunchflowTransaction[]> {
  // accountId IS the emitter_id (returned by getAccounts handler)
  const txs = await fetchTransactions(accountId);
  return txs.map((t: SumeriaTransaction) => {
    const { merchant, description } = resolveMerchant(t);
    return {
      id: t.id,
      merchant,
      description,
      date: t.created_at,
      amount: t.amount, // already EUR, already signed (negative = debit)
      currency: "EUR",
      isPending: t.status !== "settled" && t.status !== "done" && t.status !== "completed",
    };
  });
}
