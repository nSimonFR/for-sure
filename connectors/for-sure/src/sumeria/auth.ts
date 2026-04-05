import { readFile, writeFile, rename } from "node:fs/promises";
import { sumeriaConfig } from "./config.js";
import type { SumeriaTokens } from "./types.js";

export async function loadTokens(): Promise<SumeriaTokens> {
  const raw = await readFile(sumeriaConfig.tokenFile, "utf-8");
  return JSON.parse(raw) as SumeriaTokens;
}

export async function saveTokens(tokens: SumeriaTokens): Promise<void> {
  const tmp = sumeriaConfig.tokenFile + ".tmp";
  await writeFile(tmp, JSON.stringify(tokens, null, 2), "utf-8");
  await rename(tmp, sumeriaConfig.tokenFile);
}
