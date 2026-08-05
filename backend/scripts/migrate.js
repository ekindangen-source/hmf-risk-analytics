import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closePostgresPool,
  getPostgresPool,
} from "../db/postgres.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(
  currentDirectory,
  "../sql/postgres",
);

try {
  const pool = await getPostgresPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE migration_name = $1",
      [file],
    );

    if (existing.rowCount > 0) {
      console.log(`Skipping ${file}`);
      continue;
    }

    const sql = await fs.readFile(
      path.join(migrationDirectory, file),
      "utf8",
    );

    await pool.query(sql);
    await pool.query(
      "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
      [file],
    );

    console.log(`Applied ${file}`);
  }

  console.log("DATABASE MIGRATION: OK");
} catch (error) {
  console.error("DATABASE MIGRATION: FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  await closePostgresPool().catch(() => {});
}
