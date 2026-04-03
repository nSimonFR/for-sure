import { getWallets } from "../swile/client.js";

export async function handleAccounts(): Promise<unknown> {
  const wallets = await getWallets();

  const accounts = wallets
    .filter((w) => w.status === "active" && w.type === "meal_voucher")
    .map((w) => ({
      id: w.id,
      name: w.name,
      balance: w.balance.value,
      currency: w.balance.currency.iso_3,
    }));

  return { accounts };
}
