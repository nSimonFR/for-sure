import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { authenticateWithPassword, authenticateWithOtp } from "./auth.js";
import { logger } from "@for-sure/lunchflow/logger";

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

export async function runSwileSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("=== for-sure: Swile Setup ===\n");

    const email    = await prompt(rl, "Swile email: ");
    const password = await prompt(rl, "Swile password: ");

    console.log("\nAuthenticating...");
    const result = await authenticateWithPassword(email, password);

    if (result.requires_otp) {
      console.log("Swile has sent a code to your email.");
      const code = await prompt(rl, "Enter code: ");

      console.log("Verifying...");
      await authenticateWithOtp(email, password, code);
    }

    console.log("\nTokens saved successfully!");
    logger.info("Swile setup completed");
  } finally {
    rl.close();
  }
}
