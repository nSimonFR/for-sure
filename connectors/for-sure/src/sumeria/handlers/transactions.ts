import { getTransactions as fetchTransactions } from "../client.js";
import type { LunchflowTransaction } from "@for-sure/lunchflow/types";

export async function getTransactions(accountId: string): Promise<LunchflowTransaction[]> {
  // accountId IS the emitter_id (returned by getAccounts handler)
  const txs = await fetchTransactions(accountId);
  return txs.map((t) => ({
    id: t.id,
    merchant: t.title,
    date: t.created_at,
    amount: t.amount, // already EUR, already signed (negative = debit)
    currency: "EUR",
    isPending: t.status !== "settled" && t.status !== "done" && t.status !== "completed",
  }));
}
