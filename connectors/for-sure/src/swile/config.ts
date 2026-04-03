import { config as shared } from "../config.js";
import { resolve } from "node:path";

export const swileConfig = {
  tokenFile: process.env.SWILE_TOKEN_FILE || resolve(shared.dataDir, "swile-tokens.json"),
  accountName: process.env.SWILE_ACCOUNT_NAME || null,
};
