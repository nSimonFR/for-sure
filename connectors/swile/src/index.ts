import { runSetup } from "./setup.js";
import { startServer } from "./server.js";

if (process.argv.includes("--setup")) {
  runSetup().catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
} else {
  startServer();
}
