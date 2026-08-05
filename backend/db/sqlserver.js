import sql from "mssql";
import { getSqlServerSecret } from "../config/secrets.js";

let poolPromise;

export async function getSqlServerPool() {
  if (!poolPromise) {
    poolPromise = getSqlServerSecret()
      .then((secret) => {
        const pool = new sql.ConnectionPool({
          server: secret.host,
          port: Number(secret.port || 1433),
          database: secret.database || "emf",
          user: secret.username,
          password: secret.password,
          options: {
            encrypt: secret.encrypt !== false,
            trustServerCertificate: secret.trustServerCertificate === true,
            enableArithAbort: true,
          },
          pool: {
            max: 3,
            min: 0,
            idleTimeoutMillis: 30_000,
          },
          connectionTimeout: 15_000,
          requestTimeout: 120_000,
        });

        return pool.connect();
      })
      .catch((error) => {
        poolPromise = undefined;
        throw error;
      });
  }

  return poolPromise;
}

export async function closeSqlServerPool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = undefined;
  }
}
