import { getAccessToken, refreshTokens } from "./auth.js";
import { logger } from "../logger.js";
import type { SwileWallet, SwileOperation } from "./types.js";

const SWILE_API = "https://neobank-api.swile.co/api";

async function swileFetch(path: string, retried = false): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${SWILE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && !retried) {
    logger.warn("Got 401 from Swile, forcing token refresh");
    await refreshTokens();
    return swileFetch(path, true);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Swile API error (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getWallets(): Promise<SwileWallet[]> {
  const data = (await swileFetch("/v0/wallets")) as { wallets: SwileWallet[] };
  return data.wallets;
}

export async function getOperations(): Promise<SwileOperation[]> {
  const data = (await swileFetch("/v3/user/operations?per=999999")) as {
    operations: SwileOperation[];
  };
  return data.operations;
}
