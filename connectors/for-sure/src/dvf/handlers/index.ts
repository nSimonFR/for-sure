import type { LunchflowAccount, LunchflowBalance, LunchflowTransaction, RouteResult } from "@for-sure/lunchflow/types";
import { getEstimate, lastEstimate, loadProperty } from "../client.js";
import { dvfConfig } from "../config.js";

const ID = "property";

function own(accountId: string): void {
  if (accountId !== ID) throw Object.assign(new Error("Account not found"), { statusCode: 404 });
}

// Never hits the network: a DVF outage must not hide the Swile/Sumeria accounts.
// Sure takes the balance from /balance, not from this list.
export async function getAccounts(): Promise<LunchflowAccount[]> {
  if (!dvfConfig.propertyFile) return [];
  try {
    const p = await loadProperty(dvfConfig.propertyFile);
    return [{ id: ID, name: p.name, balance: lastEstimate()?.value ?? 0, currency: "EUR" }];
  } catch (err) {
    console.error("[dvf]", err);
    return [];
  }
}

export async function getBalance(accountId: string): Promise<LunchflowBalance> {
  own(accountId);
  const e = await getEstimate(await loadProperty(dvfConfig.propertyFile));
  return { amount: e.value, currency: "EUR" };
}

export async function getTransactions(accountId: string): Promise<LunchflowTransaction[]> {
  own(accountId);
  return [];
}

export async function getHoldings(_accountId: string): Promise<RouteResult> {
  return { status: 501, body: { error: "Holdings not supported for DVF" } };
}
