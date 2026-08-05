import {
  closePostgresPool,
} from "../db/postgres.js";

import {
  closeSqlServerPool,
} from "../db/sqlserver.js";

import {
  refreshAnalytics,
} from "../services/analyticsRefresh.js";

const triggerType = process.argv[2] || "manual";

try {
  const result = await refreshAnalytics(triggerType);
  console.log("ANALYTICS REFRESH: OK");
  console.log(result);
} catch (error) {
  console.error("ANALYTICS REFRESH: FAILED");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeSqlServerPool().catch(() => {});
  await closePostgresPool().catch(() => {});
}
