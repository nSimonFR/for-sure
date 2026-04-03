import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveTokensFromSetup } from "./swile/auth.js";
import { logger } from "./logger.js";

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("=== for-sure-swile: Manual Token Setup ===\n");
    console.log("1. Open https://team.swile.co in your browser and log in.");
    console.log("2. Open DevTools → Network tab → filter for 'directory.swile.co'.");
    console.log("3. Find the POST /oauth/token response after login completes.");
    console.log("4. Copy the access_token, refresh_token, and expires_in values below.\n");

    const access_token  = await prompt(rl, "access_token:  ");
    const refresh_token = await prompt(rl, "refresh_token: ");
    const expires_in    = parseInt(await prompt(rl, "expires_in (seconds, e.g. 7200): "), 10);

    if (!access_token || !refresh_token || isNaN(expires_in)) {
      throw new Error("All three values are required.");
    }

    await saveTokensFromSetup({ access_token, refresh_token, expires_in });
    console.log("\nTokens saved successfully!");
    logger.info("Setup completed");
  } finally {
    rl.close();
  }
}
