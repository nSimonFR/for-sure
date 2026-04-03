import { handleAccounts } from "./handlers/accounts.js";
import { handleTransactions } from "./handlers/transactions.js";
import { handleBalance } from "./handlers/balance.js";
import { handleHoldings } from "./handlers/holdings.js";

const PREFIX = "/api/v1";

interface RouteResult {
  status: number;
  body: unknown;
}

export async function route(
  method: string,
  pathname: string,
  query: URLSearchParams,
): Promise<RouteResult> {
  if (!pathname.startsWith(PREFIX)) {
    return { status: 404, body: { error: "Not found" } };
  }

  const path = pathname.slice(PREFIX.length);

  if (method === "GET" && path === "/accounts") {
    const body = await handleAccounts();
    return { status: 200, body };
  }

  // Match /accounts/:id/transactions
  const txMatch = path.match(/^\/accounts\/([^/]+)\/transactions$/);
  if (method === "GET" && txMatch) {
    const body = await handleTransactions(txMatch[1], query);
    return { status: 200, body };
  }

  // Match /accounts/:id/balance
  const balMatch = path.match(/^\/accounts\/([^/]+)\/balance$/);
  if (method === "GET" && balMatch) {
    const body = await handleBalance(balMatch[1]);
    if ((body as { status?: number }).status === 404) {
      return { status: 404, body };
    }
    return { status: 200, body };
  }

  // Match /accounts/:id/holdings
  const holdMatch = path.match(/^\/accounts\/([^/]+)\/holdings$/);
  if (method === "GET" && holdMatch) {
    const body = await handleHoldings(holdMatch[1]);
    return { status: 501, body };
  }

  return { status: 404, body: { error: "Not found" } };
}
