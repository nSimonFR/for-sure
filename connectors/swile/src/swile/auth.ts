import { readFile, writeFile, rename } from "node:fs/promises";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { TokenData } from "./types.js";

const SWILE_TOKEN_URL = "https://directory.swile.co/oauth/token";
const SWILE_CLIENT_ID = "swile_app";
const REFRESH_MARGIN_SEC = 60;

let cachedTokens: TokenData | null = null;
let refreshPromise: Promise<TokenData> | null = null;

export async function saveTokensFromSetup(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): Promise<void> {
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  });
}

async function saveTokens(tokens: TokenData): Promise<void> {
  const tmp = config.tokenFile + ".tmp";
  await writeFile(tmp, JSON.stringify(tokens, null, 2), "utf-8");
  await rename(tmp, config.tokenFile);
  cachedTokens = tokens;
}

async function parseAndSaveTokens(res: Response, context: string): Promise<TokenData> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${context} (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };
  await saveTokens(tokens);
  return tokens;
}

export async function loadTokens(): Promise<TokenData> {
  if (cachedTokens) return cachedTokens;
  const raw = await readFile(config.tokenFile, "utf-8");
  cachedTokens = JSON.parse(raw) as TokenData;
  return cachedTokens;
}

export async function getAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - now < REFRESH_MARGIN_SEC) {
    tokens = await refreshTokens(tokens);
  }
  return tokens.access_token;
}

function swileTokenRequest(body: Record<string, string>): Promise<Response> {
  return fetch(SWILE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: SWILE_CLIENT_ID, ...body }),
  });
}

export async function refreshTokens(tokens?: TokenData): Promise<TokenData> {
  if (refreshPromise) return refreshPromise;
  const current = tokens || (await loadTokens());
  refreshPromise = (async () => {
    logger.info("Refreshing Swile access token");
    const res = await swileTokenRequest({
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
    });
    const t = await parseAndSaveTokens(res, "Token refresh failed");
    logger.info("Token refreshed and saved");
    return t;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

