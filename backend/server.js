import compression from "compression";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";

import {
  closePostgresPool,
} from "./db/postgres.js";

import {
  closeSqlServerPool,
} from "./db/sqlserver.js";

import healthRouter from "./routes/health.js";
import adminRouter from "./routes/admin.js";
import dashboardRouter from "./routes/dashboard.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

app.disable("x-powered-by");
app.set("trust proxy", "loopback");

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(pinoHttp({ logger }));

app.use("/api/health", healthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: "Not found",
  });
});

app.use((error, request, response, _next) => {
  request.log.error({ error }, "Unhandled request error");

  response.status(500).json({
    error: "Internal server error",
  });
});

const server = app.listen(port, host, () => {
  logger.info({ host, port }, "HMF Risk Analytics API started");
});

async function shutdown(signal) {
  logger.info({ signal }, "Graceful shutdown started");

  server.close(async () => {
    await Promise.allSettled([
      closeSqlServerPool(),
      closePostgresPool(),
    ]);

    logger.info("Graceful shutdown completed");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
