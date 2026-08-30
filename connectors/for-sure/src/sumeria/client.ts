import { loadTokens } from "./auth.js";
import { sendTelegram } from "../notify.js";
import type { SumeriaAccount, SumeriaTransaction } from "./types.js";

const BASE = "https://api.lydia-app.com";

async function sumeriaFetch(path: string, init?: RequestInit): Promise<unknown> {
  const t = await loadTokens();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "auth_token":     t.auth_token,
      "public_token":   t.public_token,
      "access-token":   t.access_token,
      "authorization":  `Bearer ${t.access_token}`,
      "accept":         "application/json",
      "content-type":   "application/json",
      "user-agent":     "LYDIA/15.16.0 (com.lydia-app; build:5;iOS 26.3.1 URLSession)",
      "app_version":    "iPhone_Sumeria 15.16.0",
      "phone_os":       "iOS",
      "x-app-source":   "banking-app",
    },
  });

  if (res.status === 401) {
    // TODO(sumeria-mitm): tokens are static session headers captured via mitmproxy (no OAuth
    // refresh). Renew by opening the Sumeria app with iPhone proxy → RPi5:8889 — the
    // for-sure-mitm service will auto-write fresh tokens to sumeria-tokens.json.
    await sendTelegram(
      "⚠️ <b>for-sure / Sumeria</b>: tokens expired (401)\n" +
      "Enable RPi5 exit node on iPhone and open the Sumeria app to auto-refresh.",
    );
    throw new Error(
      "Sumeria 401: tokens expired — enable RPi5 exit node on iPhone and open Sumeria app",
    );
  }
  if (!res.ok) {
    throw new Error(`Sumeria API error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function getAccounts(): Promise<SumeriaAccount[]> {
  const data = (await sumeriaFetch("/accounts")) as { items: SumeriaAccount[] };
  return data.items;
}

// /history/_search is an Elasticsearch-style endpoint: `size` caps one page and
// `from` is a true offset (verified live — from=0 and from=999 share no ids, and
// from=total-1 returns exactly one row). It also returns an exact `total`.
export const PAGE_SIZE = 999;

// Safety net so a server that ignores `from` can never spin forever. 50 pages is
// ~50k transactions, far beyond any real account.
const MAX_PAGES = 50;

export interface SumeriaHistoryPage {
  total?: number;
  items: SumeriaTransaction[];
}

/**
 * Walks every page of a history search.
 *
 * Exported for testing — takes the page fetcher as a seam so the paging rules can
 * be exercised without the network.
 *
 * Stops on the first of: a short page (the last one), a page that contributes no
 * new ids (the server ignored `from`, or newly-arrived rows shifted the window
 * back onto what we already hold), reaching the reported `total`, or MAX_PAGES.
 * Ids are de-duplicated because the sort window can shift while we page.
 */
export async function collectHistoryPages(
  fetchPage: (from: number, size: number) => Promise<SumeriaHistoryPage>,
  pageSize: number = PAGE_SIZE,
  maxPages: number = MAX_PAGES,
): Promise<SumeriaTransaction[]> {
  const out: SumeriaTransaction[] = [];
  const seen = new Set<string>();
  let from = 0;
  let total = Number.POSITIVE_INFINITY;

  for (let page = 0; page < maxPages; page++) {
    const { total: reported, items } = await fetchPage(from, pageSize);
    if (typeof reported === "number") total = reported;
    const batch = items ?? [];

    let added = 0;
    for (const tx of batch) {
      const id = tx?.id;
      if (id != null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(tx);
      added++;
    }

    from += batch.length;
    if (batch.length < pageSize || added === 0 || from >= total) break;
  }

  return out;
}

function historyBody(emitterId: string, from: number, size: number): string {
  return JSON.stringify({
    size,
    from,
    sort: [{ createdAt: "desc" }],
    query: {
      bool: {
        should: [
          { term: { "emitter.id": emitterId } },
          { term: { "receiver.id": emitterId } },
        ],
        minimum_should_match: 1,
        must_not: [
          { term: { selfPayment: true } },
          { term: { type: "aispis_transaction" } },
          { term: { purpose: "savings:roundings" } },
        ],
      },
    },
  });
}

export async function getTransactions(emitterId: string): Promise<SumeriaTransaction[]> {
  return collectHistoryPages(async (from, size) =>
    (await sumeriaFetch("/history/_search", {
      method: "POST",
      body: historyBody(emitterId, from, size),
    })) as SumeriaHistoryPage,
  );
}
