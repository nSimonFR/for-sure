import { loadTokens } from "./auth.js";
import type { SumeriaAccount, SumeriaTransaction } from "./types.js";

const BASE = "https://api.lydia-app.com";

async function suteriaFetch(path: string, init?: RequestInit): Promise<unknown> {
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
    throw new Error(
      "Sumeria 401: tokens expired — re-run `for-sure --setup sumeria` with fresh MITM tokens",
    );
  }
  if (!res.ok) {
    throw new Error(`Sumeria API error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function getAccounts(): Promise<SumeriaAccount[]> {
  const data = (await suteriaFetch("/accounts")) as { items: SumeriaAccount[] };
  return data.items;
}

export async function getTransactions(emitterId: string): Promise<SumeriaTransaction[]> {
  const body = JSON.stringify({
    size: 999,
    from: 0,
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
  const data = (await suteriaFetch("/history/_search", { method: "POST", body })) as {
    items: SumeriaTransaction[];
  };
  return data.items;
}
