import fs from "node:fs/promises";

import { getPostgresPool } from "../db/postgres.js";
import { getSqlServerPool } from "../db/sqlserver.js";

const portfolioQueryUrl = new URL(
  "../sql/sqlserver/portfolio_metrics.sql",
  import.meta.url,
);

const interventionQueryUrl = new URL(
  "../sql/sqlserver/early_intervention.sql",
  import.meta.url,
);

function dateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

export async function refreshAnalytics(triggerType = "manual") {
  if (!["scheduled", "manual", "startup"].includes(triggerType)) {
    throw new Error(`Invalid refresh trigger: ${triggerType}`);
  }

  const postgresPool = await getPostgresPool();
  const postgres = await postgresPool.connect();

  let refreshRunId;
  let lockAcquired = false;

  try {
    const lockResult = await postgres.query(`
      SELECT pg_try_advisory_lock(
        hashtext('hmf-risk-analytics-refresh')
      ) AS acquired
    `);

    lockAcquired = lockResult.rows[0].acquired;

    if (!lockAcquired) {
      throw new Error("Another analytics refresh is already running");
    }

    const runResult = await postgres.query(
      `INSERT INTO refresh_runs (
         trigger_type,
         status,
         source_server,
         source_database
       )
       VALUES ($1, 'running', 'DBSQLBTN', 'emf')
       RETURNING id`,
      [triggerType],
    );

    refreshRunId = runResult.rows[0].id;

    const [portfolioSql, interventionSql] = await Promise.all([
      fs.readFile(portfolioQueryUrl, "utf8"),
      fs.readFile(interventionQueryUrl, "utf8"),
    ]);

    const sqlServer = await getSqlServerPool();

    const portfolioRows = (
      await sqlServer.request().query(portfolioSql)
    ).recordset;

    const interventionRows = (
      await sqlServer.request().query(interventionSql)
    ).recordset;

    if (portfolioRows.length === 0) {
      throw new Error("Source returned no portfolio aggregates");
    }

    const snapshotDate = dateOnly(
      portfolioRows[0].snapshot_date,
    );

    const allDatesMatch = [
      ...portfolioRows,
      ...interventionRows,
    ].every((row) => dateOnly(row.snapshot_date) === snapshotDate);

    if (!allDatesMatch) {
      throw new Error("Source aggregates contain mixed snapshot dates");
    }

    await postgres.query("BEGIN");

    await postgres.query(
      "DELETE FROM portfolio_metrics WHERE snapshot_date = $1",
      [snapshotDate],
    );

    await postgres.query(
      "DELETE FROM early_intervention_metrics WHERE snapshot_date = $1",
      [snapshotDate],
    );

    await postgres.query(
      "DELETE FROM dashboard_kpis WHERE snapshot_date = $1",
      [snapshotDate],
    );

    for (const row of portfolioRows) {
      await postgres.query(
        `INSERT INTO portfolio_metrics (
           snapshot_date,
           branch_code,
           branch_name,
           asset_category,
           aging_bucket,
           contract_count,
           outstanding_amount,
           overdue_amount,
           installment_amount
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          snapshotDate,
          row.branch_code,
          row.branch_name,
          row.asset_category,
          row.aging_bucket,
          row.contract_count,
          row.outstanding_amount,
          row.overdue_amount,
          row.installment_amount,
        ],
      );
    }

    for (const row of interventionRows) {
      await postgres.query(
        `INSERT INTO early_intervention_metrics (
           snapshot_date,
           branch_code,
           branch_name,
           asset_category,
           current_contracts,
           dpd_1_7_contracts,
           dpd_8_30_contracts,
           intervention_contracts,
           intervention_outstanding,
           intervention_overdue
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          snapshotDate,
          row.branch_code,
          row.branch_name,
          row.asset_category,
          row.current_contracts,
          row.dpd_1_7_contracts,
          row.dpd_8_30_contracts,
          row.intervention_contracts,
          row.intervention_outstanding,
          row.intervention_overdue,
        ],
      );
    }

    await postgres.query(
      `INSERT INTO dashboard_kpis (
         snapshot_date,
         total_contracts,
         total_outstanding,
         current_contracts,
         delinquent_contracts,
         early_intervention_contracts,
         total_overdue,
         branch_count
       )
       SELECT
         snapshot_date,
         SUM(contract_count),
         SUM(outstanding_amount),
         SUM(
           CASE WHEN aging_bucket = 'CURRENT'
             THEN contract_count ELSE 0 END
         ),
         SUM(
           CASE WHEN aging_bucket <> 'CURRENT'
             THEN contract_count ELSE 0 END
         ),
         SUM(
           CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
             THEN contract_count ELSE 0 END
         ),
         SUM(overdue_amount),
         COUNT(DISTINCT branch_code)
       FROM portfolio_metrics
       WHERE snapshot_date = $1
       GROUP BY snapshot_date`,
      [snapshotDate],
    );

    const rowsWritten =
      portfolioRows.length + interventionRows.length + 1;

    await postgres.query(
      `UPDATE refresh_runs
       SET status = 'completed',
           snapshot_date = $2,
           completed_at = NOW(),
           rows_extracted = $3,
           rows_written = $4
       WHERE id = $1`,
      [
        refreshRunId,
        snapshotDate,
        portfolioRows.length + interventionRows.length,
        rowsWritten,
      ],
    );

    await postgres.query("COMMIT");

    return {
      refreshRunId,
      snapshotDate,
      portfolioRows: portfolioRows.length,
      interventionRows: interventionRows.length,
      rowsWritten,
    };
  } catch (error) {
    await postgres.query("ROLLBACK").catch(() => {});

    if (refreshRunId) {
      await postgres.query(
        `UPDATE refresh_runs
         SET status = 'failed',
             completed_at = NOW(),
             error_message = LEFT($2, 2000)
         WHERE id = $1`,
        [refreshRunId, error.message],
      ).catch(() => {});
    }

    throw error;
  } finally {
    if (lockAcquired) {
      await postgres.query(`
        SELECT pg_advisory_unlock(
          hashtext('hmf-risk-analytics-refresh')
        )
      `).catch(() => {});
    }

    postgres.release();
  }
}
