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
  const data = (await sumeriaFetch("/history/_search", { method: "POST", body })) as {
    items: SumeriaTransaction[];
  };
  return data.items;
}
