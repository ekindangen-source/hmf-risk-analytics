import { Router } from "express";
import { getPostgresPool } from "../db/postgres.js";

const router = Router();

router.get("/summary", async (_request, response) => {
  const pool = await getPostgresPool();

  const result = await pool.query(`
    SELECT *
    FROM dashboard_kpis
    ORDER BY snapshot_date DESC
    LIMIT 1
  `);

  response.json({
    data: result.rows[0] || null,
  });
});

router.get("/aging", async (_request, response) => {
  const pool = await getPostgresPool();

  const result = await pool.query(`
    WITH latest AS (
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM portfolio_metrics
    )
    SELECT
      p.snapshot_date,
      p.aging_bucket,
      SUM(p.contract_count) AS contract_count,
      SUM(p.outstanding_amount) AS outstanding_amount,
      SUM(p.overdue_amount) AS overdue_amount,
      SUM(p.installment_amount) AS installment_amount
    FROM portfolio_metrics AS p
    JOIN latest AS l
      ON l.snapshot_date = p.snapshot_date
    GROUP BY p.snapshot_date, p.aging_bucket
    ORDER BY CASE p.aging_bucket
      WHEN 'CURRENT' THEN 1
      WHEN 'DPD_1_7' THEN 2
      WHEN 'DPD_8_30' THEN 3
      WHEN 'DPD_31_60' THEN 4
      WHEN 'DPD_61_90' THEN 5
      WHEN 'DPD_91_120' THEN 6
      ELSE 7
    END
  `);

  response.json({ data: result.rows });
});

router.get("/early-intervention", async (_request, response) => {
  const pool = await getPostgresPool();

  const result = await pool.query(`
    WITH latest AS (
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM early_intervention_metrics
    )
    SELECT
      e.snapshot_date,
      e.branch_code,
      e.branch_name,
      e.asset_category,
      e.current_contracts,
      e.dpd_1_7_contracts,
      e.dpd_8_30_contracts,
      e.intervention_contracts,
      e.intervention_outstanding,
      e.intervention_overdue
    FROM early_intervention_metrics AS e
    JOIN latest AS l
      ON l.snapshot_date = e.snapshot_date
    ORDER BY
      e.intervention_contracts DESC,
      e.branch_name,
      e.asset_category
  `);

  response.json({ data: result.rows });
});

router.get("/filters", async (_request, response) => {
  const pool = await getPostgresPool();

  const [branches, assets] = await Promise.all([
    pool.query(`
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM portfolio_metrics
      )
      SELECT DISTINCT branch_code, branch_name
      FROM portfolio_metrics
      WHERE snapshot_date = (SELECT snapshot_date FROM latest)
      ORDER BY branch_name
    `),

    pool.query(`
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM portfolio_metrics
      )
      SELECT DISTINCT asset_category
      FROM portfolio_metrics
      WHERE snapshot_date = (SELECT snapshot_date FROM latest)
      ORDER BY asset_category
    `),
  ]);

  response.json({
    data: {
      branches: branches.rows,
      assets: assets.rows.map((row) => row.asset_category),
    },
  });
});

router.get("/refresh-status", async (_request, response) => {
  const pool = await getPostgresPool();

  const result = await pool.query(`
    SELECT
      id,
      trigger_type,
      status,
      snapshot_date,
      rows_extracted,
      rows_written,
      started_at,
      completed_at
    FROM refresh_runs
    ORDER BY id DESC
    LIMIT 10
  `);

  response.json({ data: result.rows });
});

export default router;
