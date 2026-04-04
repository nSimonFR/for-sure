import { createServer } from "node:http";
import { logger } from "./logger.js";
import { createRouter } from "./router.js";
import type { LunchflowHandlers } from "./types.js";

export interface ServerConfig {
  port: number;
  host: string;
  getApiKey(): Promise<string>;
}

export function startServer(config: ServerConfig, handlers: LunchflowHandlers): void {
  const route = createRouter(handlers);

  const server = createServer(async (req, res) => {
    const start = Date.now();

    const apiKey = await config.getApiKey();
    if (apiKey && req.headers["x-api-key"] !== apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const result = await route(req.method || "GET", url.pathname);
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

  server.listen(config.port, config.host, () =>
    logger.info("Server started", { host: config.host, port: config.port }),
  );
}
