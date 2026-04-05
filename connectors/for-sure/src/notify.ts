import { readFile } from "node:fs/promises";
import { config } from "./config.js";

let cachedBotToken: string | null = null;

async function getBotToken(): Promise<string | null> {
  if (cachedBotToken !== null) return cachedBotToken;
  if (!config.telegramBotTokenFile) return null;
  cachedBotToken = (await readFile(config.telegramBotTokenFile, "utf-8")).trim();
  return cachedBotToken;
}

export async function sendTelegram(message: string): Promise<void> {
  const token = await getBotToken();
  if (!token || !config.telegramChatId) return;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, text: message, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error(`Telegram notify failed (${res.status}): ${await res.text()}`);
  }
}
