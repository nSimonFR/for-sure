export const config = {
  port: parseInt(process.env.PORT || "8340", 10),
  host: process.env.HOST || "127.0.0.1",
  tokenFile: process.env.SWILE_TOKEN_FILE || "/var/lib/for-sure-swile/tokens.json",
  apiKey: process.env.FOR_SURE_API_KEY || "",
};
