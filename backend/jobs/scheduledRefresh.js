import cron from "node-cron";
import pino from "pino";

import {
  closePostgresPool,
} from "../db/postgres.js";

import {
  closeSqlServerPool,
} from "../db/sqlserver.js";

import {
  refreshAnalytics,
} from "../services/analyticsRefresh.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

let running = false;

async function runScheduledRefresh() {
  if (running) {
    logger.warn("Scheduled refresh skipped because another run is active");
    return;
  }

  running = true;

  try {
    const result = await refreshAnalytics("scheduled");
    logger.info({ result }, "Scheduled analytics refresh completed");
  } catch (error) {
    logger.error({ error }, "Scheduled analytics refresh failed");
  } finally {
    running = false;
  }
}

cron.schedule(
  "15 6 * * *",
  runScheduledRefresh,
  {
    timezone: "Asia/Jakarta",
  },
);

logger.info(
  {
    schedule: "06:15",
    timezone: "Asia/Jakarta",
  },
  "Analytics refresh scheduler started",
);

async function shutdown(signal) {
  logger.info({ signal }, "Scheduler shutdown started");

  await Promise.allSettled([
    closeSqlServerPool(),
    closePostgresPool(),
  ]);

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
