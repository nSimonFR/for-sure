import { readFile } from "node:fs/promises";

export const config = {
  port: parseInt(process.env.PORT || "8340", 10),
  host: process.env.HOST || "127.0.0.1",
  tokenFile: process.env.SWILE_TOKEN_FILE || "/var/lib/for-sure-swile/tokens.json",
  apiKeyFile: process.env.SWILE_API_KEY_FILE || "",
};

let cachedApiKey: string | null = null;

export async function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) return cachedApiKey;
  if (!config.apiKeyFile) return "";
  cachedApiKey = (await readFile(config.apiKeyFile, "utf-8")).trim();
  return cachedApiKey;
}
