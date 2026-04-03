import { runSwileSetup } from "./swile/setup.js";
import { runSumeriaSetup } from "./sumeria/setup.js";

export async function runSetup(connector: string): Promise<void> {
  if (connector === "swile") return runSwileSetup();
  if (connector === "sumeria") return runSumeriaSetup();
  console.error(`Unknown connector: ${connector}. Use 'swile' or 'sumeria'.`);
  process.exit(1);
}
