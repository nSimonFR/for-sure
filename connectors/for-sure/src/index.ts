import { startServer } from "@for-sure/lunchflow/server";
import { config, getApiKey } from "./config.js";
import { runSetup } from "./setup.js";
import type { LunchflowHandlers, LunchflowAccount } from "@for-sure/lunchflow/types";
import * as swile from "./swile/handlers/index.js";
import * as sumeria from "./sumeria/handlers/index.js";
import * as dvf from "./dvf/handlers/index.js";

function withPrefix(prefix: string, items: LunchflowAccount[]): LunchflowAccount[] {
  return items.map((item) => ({ ...item, id: `${prefix}:${item.id}` }));
}

function strip(prefix: string, id: string): string {
  const p = `${prefix}:`;
  if (!id.startsWith(p)) throw Object.assign(new Error(`ID does not belong to ${prefix}`), { statusCode: 404 });
  return id.slice(p.length);
}

const handlers: LunchflowHandlers = {
  // One provider down (e.g. Sumeria tokens expired) must not hide the others.
  // Sure keeps an account that drops out of the list while it is linked.
  async getAccounts() {
    const sources = { swile: swile.getAccounts(), sumeria: sumeria.getAccounts(), dvf: dvf.getAccounts() };
    const results = await Promise.allSettled(Object.values(sources));
    const failures = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    if (failures.length === results.length) throw failures[0];

    return Object.keys(sources).flatMap((prefix, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return withPrefix(prefix, r.value);
      console.error(`[accounts] ${prefix} skipped:`, r.reason instanceof Error ? r.reason.message : r.reason);
      return [];
    });
  },

  async getTransactions(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getTransactions(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getTransactions(strip("sumeria", accountId));
    if (accountId.startsWith("dvf:"))     return dvf.getTransactions(strip("dvf", accountId));
    throw Object.assign(new Error("Unknown account"), { statusCode: 404 });
  },

  async getBalance(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getBalance(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getBalance(strip("sumeria", accountId));
    if (accountId.startsWith("dvf:"))     return dvf.getBalance(strip("dvf", accountId));
    throw Object.assign(new Error("Unknown account"), { statusCode: 404 });
  },

  async getHoldings(accountId) {
    if (accountId.startsWith("swile:"))   return swile.getHoldings(strip("swile", accountId));
    if (accountId.startsWith("sumeria:")) return sumeria.getHoldings(strip("sumeria", accountId));
    if (accountId.startsWith("dvf:"))     return dvf.getHoldings(strip("dvf", accountId));
    throw Object.assign(new Error("Unknown account"), { statusCode: 404 });
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
