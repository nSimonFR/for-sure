import { config as shared } from "../config.js";
import { resolve } from "node:path";

export const sumeriaConfig = {
  tokenFile: process.env.SUMERIA_TOKEN_FILE || resolve(shared.dataDir, "sumeria-tokens.json"),
};
