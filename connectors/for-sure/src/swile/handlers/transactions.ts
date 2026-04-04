import { getOperations } from "../client.js";
import type { LunchflowTransaction } from "@for-sure/lunchflow/types";

export async function getTransactions(accountId: string): Promise<LunchflowTransaction[]> {
  const operations = await getOperations();
  return operations
    .filter((op) =>
      op.transactions.some(
        (t) =>
          t.wallet?.uuid === accountId &&
          (t.status === "CAPTURED" || t.status === "VALIDATED" || t.status === "REFUNDED"),
      ),
    )
    .map((op) => ({
      id: op.id,
      merchant: op.name,
      date: op.date,
      amount: op.amount.value / 100,
      currency: op.amount.currency.iso_3,
      isPending: false,
    }));
}
