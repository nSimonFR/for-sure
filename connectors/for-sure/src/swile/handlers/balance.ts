import { getWallets } from "../client.js";
import type { LunchflowBalance } from "@for-sure/lunchflow/types";

export async function getBalance(accountId: string): Promise<LunchflowBalance> {
  const wallets = await getWallets();
  const wallet = wallets.find((w) => w.id === accountId);
  if (!wallet) throw Object.assign(new Error("Account not found"), { statusCode: 404 });
  return { amount: wallet.balance.value, currency: wallet.balance.currency.iso_3 };
}
