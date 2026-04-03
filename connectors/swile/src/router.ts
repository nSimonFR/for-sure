import { getWallets, getOperations } from "./swile/client.js";

const PREFIX = "/api/v1";

interface RouteResult {
  status: number;
  body: unknown;
}

export async function route(method: string, pathname: string): Promise<RouteResult> {
  if (method !== "GET" || !pathname.startsWith(PREFIX)) {
    return { status: 404, body: { error: "Not found" } };
  }

  const path = pathname.slice(PREFIX.length);

  if (path === "/accounts") {
    const wallets = await getWallets();
    const accounts = wallets
      .filter((w) => w.type === "meal_voucher" && w.is_activated && !w.archived_at)
      .map((w) => ({
        id: w.id,
        name: w.label,
        balance: w.balance.value,
        currency: w.balance.currency.iso_3,
      }));
    return { status: 200, body: { accounts } };
  }

  const match = path.match(/^\/accounts\/([^/]+)\/(transactions|balance|holdings)$/);
  if (!match) return { status: 404, body: { error: "Not found" } };

  const [, accountId, action] = match;

  if (action === "transactions") {
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
        amount: op.amount.value / 100, // cents → EUR
        currency: op.amount.currency.iso_3,
        category: op.category || null,
      }));
    return { status: 200, body: { transactions } };
  }

  if (action === "balance") {
    const wallets = await getWallets();
    const wallet = wallets.find((w) => w.id === accountId);
    if (!wallet) return { status: 404, body: { error: "Account not found" } };
    return {
      status: 200,
      body: { balance: wallet.balance.value, currency: wallet.balance.currency.iso_3 },
    };
  }

  // holdings
  return { status: 501, body: { error: "Holdings not supported for Swile" } };
}
