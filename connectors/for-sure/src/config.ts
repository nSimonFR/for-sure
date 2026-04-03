import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiKeyFile = process.env.FOR_SURE_API_KEY_FILE || "";
const credDir = process.env.CREDENTIALS_DIRECTORY || "";

export const config = {
  port: parseInt(process.env.PORT || "8340", 10),
  host: process.env.HOST || "127.0.0.1",
  dataDir: process.env.FOR_SURE_DATA_DIR || "/var/lib/for-sure",
  apiKeyFile: apiKeyFile.startsWith("/") ? apiKeyFile : credDir ? resolve(credDir, apiKeyFile) : "",
};

let cachedApiKey: string | null = null;

export async function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) return cachedApiKey;
  if (!config.apiKeyFile) return "";
  cachedApiKey = (await readFile(config.apiKeyFile, "utf-8")).trim();
  return cachedApiKey;
}
