import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveTokens } from "./auth.js";

export async function runSumeriaSetup(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log("=== for-sure: Sumeria Setup ===\n");
    console.log("Run mitmproxy, open the Sumeria app, and copy the three auth headers from any API call.\n");
    const auth_token   = (await rl.question("auth_token (32-hex): ")).trim();
    const public_token = (await rl.question("public_token: ")).trim();
    const access_token = (await rl.question("access-token (base64): ")).trim();
    await saveTokens({ auth_token, public_token, access_token });
    console.log("\nSumeria tokens saved.");
  } finally {
    rl.close();
  }
}
