import { getAccounts } from "../client.js";
import type { LunchflowBalance } from "@for-sure/lunchflow/types";

export async function getBalance(accountId: string): Promise<LunchflowBalance> {
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.emitter_id === accountId);
  if (!account) throw Object.assign(new Error("Account not found"), { statusCode: 404 });
  return { amount: parseFloat(account.balance), currency: account.currency || "EUR" };
}
