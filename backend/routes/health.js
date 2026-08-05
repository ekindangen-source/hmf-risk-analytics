import { Router } from "express";
import { getPostgresPool } from "../db/postgres.js";
import { getSqlServerPool } from "../db/sqlserver.js";

const router = Router();

router.get("/", (_request, response) => {
  response.json({
    status: "OK",
    service: "HMF Risk Analytics API",
  });
});

router.get("/dependencies", async (_request, response) => {
  const dependencies = {
    postgres: false,
    sqlServer: false,
  };

  const [postgresResult, sqlServerResult] = await Promise.allSettled([
    getPostgresPool().then((pool) => pool.query("SELECT 1")),
    getSqlServerPool().then((pool) =>
      pool.request().query("SELECT 1 AS connection_test"),
    ),
  ]);

  dependencies.postgres = postgresResult.status === "fulfilled";
  dependencies.sqlServer = sqlServerResult.status === "fulfilled";

  const healthy = dependencies.postgres && dependencies.sqlServer;

  response.status(healthy ? 200 : 503).json({
    status: healthy ? "OK" : "DEGRADED",
    service: "HMF Risk Analytics API",
    dependencies,
  });
});

export default router;
