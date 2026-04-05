import { readFile, writeFile, rename } from "node:fs/promises";
import { sumeriaConfig } from "./config.js";
import { sendTelegram } from "../notify.js";
import type { SumeriaTokens } from "./types.js";

export async function loadTokens(): Promise<SumeriaTokens> {
  try {
    const raw = await readFile(sumeriaConfig.tokenFile, "utf-8");
    return JSON.parse(raw) as SumeriaTokens;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await sendTelegram(
        "⚠️ <b>for-sure / Sumeria</b>: token file missing\n" +
        `Expected: <code>${sumeriaConfig.tokenFile}</code>\n` +
        "Enable RPi5 exit node on iPhone and open Sumeria to capture tokens.",
      );
    }
    throw err;
  }
}

export async function saveTokens(tokens: SumeriaTokens): Promise<void> {
  const tmp = sumeriaConfig.tokenFile + ".tmp";
  await writeFile(tmp, JSON.stringify(tokens, null, 2), "utf-8");
  await rename(tmp, sumeriaConfig.tokenFile);
}
