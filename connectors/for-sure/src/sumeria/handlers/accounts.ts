import { getAccounts as fetchAccounts } from "../client.js";
import type { LunchflowAccount } from "@for-sure/lunchflow/types";

export async function getAccounts(): Promise<LunchflowAccount[]> {
  const accounts = await fetchAccounts();
  return accounts.map((a) => ({
    id: a.emitter_id,              // emitter_id, NOT account_id
    name: a.display_name,
    balance: parseFloat(a.balance), // balance is a string in API
    currency: a.currency || "EUR",
  }));
}
