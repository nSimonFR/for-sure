import type { LunchflowHandlers, RouteResult } from "./types.js";

const PREFIX = "/api/v1";

export function createRouter(handlers: LunchflowHandlers) {
  return async function route(method: string, pathname: string): Promise<RouteResult> {
    if (method !== "GET" || !pathname.startsWith(PREFIX)) {
      return { status: 404, body: { error: "Not found" } };
    }

    const path = pathname.slice(PREFIX.length);

    if (path === "/accounts") {
      const accounts = await handlers.getAccounts();
      return { status: 200, body: { accounts } };
    }

    const match = path.match(/^\/accounts\/([^/]+)\/(transactions|balance|holdings)$/);
    if (!match) return { status: 404, body: { error: "Not found" } };

    const [, accountId, action] = match;

    if (action === "transactions") {
      const transactions = await handlers.getTransactions(accountId);
      return { status: 200, body: { transactions } };
    }
    if (action === "balance") {
      const balance = await handlers.getBalance(accountId);
      return { status: 200, body: { balance } };
    }
    return handlers.getHoldings(accountId);
  };
}
