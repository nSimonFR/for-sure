import { readFile, writeFile, rename } from "node:fs/promises";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { TokenData } from "./types.js";

const SWILE_TOKEN_URL = "https://directory.swile.co/oauth/token";
const SWILE_CLIENT_ID = "swile_app";
const REFRESH_MARGIN_SEC = 60;

let cachedTokens: TokenData | null = null;
let refreshPromise: Promise<TokenData> | null = null;

export async function loadTokens(): Promise<TokenData> {
  if (cachedTokens) return cachedTokens;
  const raw = await readFile(config.tokenFile, "utf-8");
  cachedTokens = JSON.parse(raw) as TokenData;
  return cachedTokens;
}

async function saveTokens(tokens: TokenData): Promise<void> {
  const tmp = config.tokenFile + ".tmp";
  await writeFile(tmp, JSON.stringify(tokens, null, 2), "utf-8");
  await rename(tmp, config.tokenFile);
  cachedTokens = tokens;
}

async function doRefresh(tokens: TokenData): Promise<TokenData> {
  logger.info("Refreshing Swile access token");
  const res = await fetch(SWILE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: SWILE_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const newTokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };

  await saveTokens(newTokens);
  logger.info("Token refreshed and saved");
  return newTokens;
}

export async function getAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  const now = Math.floor(Date.now() / 1000);

  if (tokens.expires_at - now < REFRESH_MARGIN_SEC) {
    tokens = await refreshTokens(tokens);
  }

  return tokens.access_token;
}

export async function refreshTokens(tokens?: TokenData): Promise<TokenData> {
  if (refreshPromise) return refreshPromise;

  const current = tokens || (await loadTokens());
  refreshPromise = doRefresh(current).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// For initial setup - exchange credentials for tokens
export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<{ requires_otp: boolean }> {
  const res = await fetch(SWILE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: SWILE_CLIENT_ID,
      username: email,
      password: password,
    }),
  });

  if (res.status === 403) {
    // OTP required - Swile sends it via SMS
    return { requires_otp: true };
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Authentication failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const newTokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };

  await saveTokens(newTokens);
  return { requires_otp: false };
}

export async function authenticateWithOtp(
  email: string,
  password: string,
  otp: string,
): Promise<void> {
  const res = await fetch(SWILE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: SWILE_CLIENT_ID,
      username: email,
      password: password,
      otp: otp,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OTP authentication failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const newTokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };

  await saveTokens(newTokens);
}
