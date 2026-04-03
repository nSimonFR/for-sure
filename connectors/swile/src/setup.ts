import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  authenticateWithPassword,
  authenticateWithOtp,
} from "./swile/auth.js";
import { logger } from "./logger.js";

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("=== for-sure-swile: Initial Setup ===\n");

    const email = await prompt(rl, "Swile email: ");
    const password = await prompt(rl, "Swile password: ");

    console.log("\nAuthenticating...");
    const result = await authenticateWithPassword(email, password);

    if (result.requires_otp) {
      console.log("Swile has sent an OTP to your phone.");
      const otp = await prompt(rl, "Enter OTP: ");

      console.log("Verifying OTP...");
      await authenticateWithOtp(email, password, otp);
    }

    console.log("\nTokens saved successfully!");
    logger.info("Setup completed");
  } finally {
    rl.close();
  }
}
