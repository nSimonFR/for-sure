import { getWallets } from "../swile/client.js";

export async function handleBalance(accountId: string): Promise<unknown> {
  const wallets = await getWallets();
  const wallet = wallets.find((w) => w.id === accountId);

  if (!wallet) {
    return { error: "Account not found", status: 404 };
  }

  return {
    balance: wallet.balance.value,
    currency: wallet.balance.currency.iso_3,
  };
}
