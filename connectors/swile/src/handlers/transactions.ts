import { getOperations } from "../swile/client.js";

export async function handleTransactions(
  accountId: string,
  _query: URLSearchParams,
): Promise<unknown> {
  const operations = await getOperations();

  const transactions = operations
    .filter(
      (op) =>
        op.wallet_id === accountId &&
        (op.status === "CAPTURED" || op.status === "VALIDATED"),
    )
    .map((op) => ({
      id: op.id,
      name: op.name,
      date: op.date,
      // Swile amounts are in cents — divide by 100 for EUR
      amount: op.amount.value / 100,
      currency: op.amount.currency.iso_3,
      category: op.category || null,
    }));

  return { transactions };
}
