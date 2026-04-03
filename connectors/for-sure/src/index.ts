import { startServer } from "@for-sure/lunchflow/server";
import { config, getApiKey } from "./config.js";
import { runSetup } from "./setup.js";
import type { LunchflowHandlers, LunchflowAccount } from "@for-sure/lunchflow/types";
import * as swile from "./swile/handlers/index.js";
import * as sumeria from "./sumeria/handlers/index.js";

function withPrefix(prefix: string, items: LunchflowAccount[]): LunchflowAccount[] {
  return items.map((item) => ({ ...item, id: `${prefix}:${item.id}` }));
}

function strip(prefix: string, id: string): string {
  const p = `${prefix}:`;
  if (!id.startsWith(p)) throw Object.assign(new Error(`ID does not belong to ${prefix}`), { statusCode: 404 });
  return id.slice(p.length);
}

const handlers: LunchflowHandlers = {
  async getAccounts() {
    const [swileAccts, sumeriaAccts] = await Promise.all([
      swile.getAccounts(),
      sumeria.getAccounts(),
    ]);
    return [...withPrefix("swile", swileAccts), ...withPrefix("sumeria", sumeriaAccts)];
  },

  async getTransactions(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getTransactions(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getTransactions(strip("sumeria", accountId));
    return [];
  },

  async getBalance(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getBalance(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getBalance(strip("sumeria", accountId));
    throw Object.assign(new Error("Unknown account"), { statusCode: 404 });
  },

  async getHoldings(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getHoldings(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getHoldings(strip("sumeria", accountId));
    return { status: 404, body: { error: "Unknown account" } };
  },
};

const setupArg = process.argv.indexOf("--setup");
if (setupArg !== -1) {
  const connector = process.argv[setupArg + 1];
  runSetup(connector).catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
} else {
  startServer({ port: config.port, host: config.host, getApiKey }, handlers);
}
