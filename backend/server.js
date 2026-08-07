import compression from "compression";
import {
  requireAuthentication,
  requireRole,
} from "./middleware/auth.js";
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
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import usersAdminRouter from "./routes/usersAdmin.js";
import accountDetailsRouter from "./routes/accountDetails.js";
import accountPeriodsRouter from "./routes/accountPeriods.js";
import dashboardRouter from "./routes/dashboard.js";
import salesRouter from "./routes/sales.js";
import salesPeriodsRouter from "./routes/salesPeriods.js";
import salesDetailsRouter from "./routes/salesDetails.js";
import salesTargetsAdminRouter from "./routes/salesTargetsAdmin.js";

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
app.use("/api/auth", authRouter);

/*
 * All routes below this line require an authenticated
 * application session.
 */
app.use(requireAuthentication);
app.use(
  "/api/admin/users",
  requireRole("admin"),
  usersAdminRouter,
);
app.use("/api/admin", requireRole("admin"), adminRouter);
app.use(
  "/api/admin/sales-targets",
  requireRole("admin"),
  salesTargetsAdminRouter,
);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/accounts", accountDetailsRouter);
app.use("/api/account-periods", accountPeriodsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/sales-periods", salesPeriodsRouter);
app.use("/api/sales-details", salesDetailsRouter);

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
