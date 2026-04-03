import { createServer } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { route } from "./router.js";

export function startServer(): void {
  const server = createServer(async (req, res) => {
    const start = Date.now();

    // API key authentication
    if (config.apiKey) {
      const provided = req.headers["x-api-key"];
      if (provided !== config.apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const result = await route(req.method || "GET", url.pathname, url.searchParams);

      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));

      logger.info("request", {
        method: req.method,
        path: url.pathname,
        status: result.status,
        ms: Date.now() - start,
      });
    } catch (err) {
      logger.error("request failed", {
        method: req.method,
        path: req.url,
        error: err instanceof Error ? err.message : String(err),
      });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(config.port, config.host, () => {
    logger.info("Server started", { host: config.host, port: config.port });
  });
}
