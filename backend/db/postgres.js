import fs from "node:fs";
import pg from "pg";

import { getPostgresSecret } from "../config/secrets.js";

const { Pool } = pg;

const rdsCa = fs.readFileSync(
  new URL("../../certs/rds-global-bundle.pem", import.meta.url),
  "utf8",
);

let pool;

export async function getPostgresPool() {
  if (!pool) {
    const secret = await getPostgresSecret();

    pool = new Pool({
      host: secret.host,
      port: Number(secret.port || 5432),
      database: secret.dbname || "hmfanalytics",
      user: secret.username,
      password: secret.password,
      ssl: {
        ca: rdsCa,
        rejectUnauthorized: true,
      },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "hmf-risk-analytics",
    });

    pool.on("error", (error) => {
      console.error(
        "Unexpected PostgreSQL pool error:",
        error.message,
      );
    });
  }

  return pool;
}

export async function closePostgresPool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
