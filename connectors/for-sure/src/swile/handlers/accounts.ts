import { getWallets } from "../client.js";
import { swileConfig } from "../config.js";
import type { LunchflowAccount } from "@for-sure/lunchflow/types";

export async function getAccounts(): Promise<LunchflowAccount[]> {
  const wallets = await getWallets();
  return wallets
    .filter((w) => w.type === "meal_voucher" && w.is_activated && !w.archived_at)
    .map((w) => ({
      id: w.id,
      name: swileConfig.accountName ?? w.label,
      balance: w.balance.value,
      currency: w.balance.currency.iso_3,
    }));
}
