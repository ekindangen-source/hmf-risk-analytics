import { Router } from "express";

import { getSqlServerPool } from "../db/sqlserver.js";

const router = Router();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get("/months", async (_request, response) => {
  const pool = await getSqlServerPool();
  const result = await pool.request().query(`
    SELECT
      CONVERT(char(7), REPORTDATE, 120) AS month,
      MAX(REPORTDATE) AS snapshot_date
    FROM dbo.RPT_AGING_ARM
    WHERE REPORTDATE IS NOT NULL
      AND REPORTDATE >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
      AND REPORTDATE <= CAST(GETDATE() AS date)
    GROUP BY CONVERT(char(7), REPORTDATE, 120)
    ORDER BY month DESC
  `);

  response.json({ data: result.recordset });
});

router.get("/overview", async (request, response) => {
  const month = String(request.query.month || "");

  if (!monthPattern.test(month)) {
    return response.status(400).json({
      error: "month must use YYYY-MM format",
    });
  }

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("monthStart", `${month}-01`)
    .query(`
      DECLARE @StartDate date = CAST(@monthStart AS date);
      DECLARE @EndDate date = DATEADD(month, 1, @StartDate);
      DECLARE @SnapshotDate date = (
        SELECT MAX(REPORTDATE)
        FROM dbo.RPT_AGING_ARM
        WHERE REPORTDATE >= @StartDate
          AND REPORTDATE < @EndDate
          AND REPORTDATE <= CAST(GETDATE() AS date)
      );

      IF @SnapshotDate IS NULL
        THROW 50001, 'No account snapshot is available for this month', 1;

      SELECT
        @SnapshotDate AS snapshot_date,
        COALESCE(
          NULLIF(LTRIM(RTRIM(BRANCHCODE)), ''),
          'UNKNOWN'
        ) AS branch_code,
        COALESCE(
          NULLIF(LTRIM(RTRIM(BRANCHNAME)), ''),
          'Unknown Branch'
        ) AS branch_name,
        CASE
          WHEN LTRIM(RTRIM(ASSETKIND)) = 'ASK01' THEN 'Mobil'
          WHEN LTRIM(RTRIM(ASSETKIND)) = 'ASK02' THEN 'Sepeda Motor'
          WHEN LTRIM(RTRIM(ASSETKIND)) = 'ASK31' THEN 'FastDana Mobil'
          WHEN LTRIM(RTRIM(ASSETKIND)) = 'ASK32' THEN 'FastDana Motor'
          ELSE 'Other'
        END AS asset_category,
        CASE
          WHEN COALESCE(PASTDUEDAYS, 0) <= 0 THEN 'CURRENT'
          WHEN PASTDUEDAYS <= 7 THEN 'DPD_1_7'
          WHEN PASTDUEDAYS <= 30 THEN 'DPD_8_30'
          WHEN PASTDUEDAYS <= 60 THEN 'DPD_31_60'
          WHEN PASTDUEDAYS <= 90 THEN 'DPD_61_90'
          WHEN PASTDUEDAYS <= 120 THEN 'DPD_91_120'
          ELSE 'DPD_121_PLUS'
        END AS aging_bucket,
        CAST(COALESCE(SALDOEOM, 0) AS decimal(28,2))
          AS outstanding_amount,
        CAST(COALESCE(TOTALLATE, 0) AS decimal(28,2))
          AS overdue_amount,
        CAST(COALESCE(INSTALLMENTAMOUNT, 0) AS decimal(28,2))
          AS installment_amount
      INTO #Accounts
      FROM dbo.RPT_AGING_ARM
      WHERE REPORTDATE = @SnapshotDate
        AND SALDOEOM > 0;

      SELECT
        @SnapshotDate AS snapshot_date,
        COUNT_BIG(*) AS total_contracts,
        SUM(outstanding_amount) AS total_outstanding,
        SUM(CASE WHEN aging_bucket = 'CURRENT' THEN 1 ELSE 0 END)
          AS current_contracts,
        SUM(CASE WHEN aging_bucket <> 'CURRENT' THEN 1 ELSE 0 END)
          AS delinquent_contracts,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN 1 ELSE 0 END) AS early_intervention_contracts,
        SUM(overdue_amount) AS total_overdue,
        COUNT(DISTINCT branch_code) AS branch_count,
        GETDATE() AS refreshed_at
      FROM #Accounts;

      SELECT
        @SnapshotDate AS snapshot_date,
        aging_bucket,
        COUNT_BIG(*) AS contract_count,
        SUM(outstanding_amount) AS outstanding_amount,
        SUM(overdue_amount) AS overdue_amount,
        SUM(installment_amount) AS installment_amount
      FROM #Accounts
      GROUP BY aging_bucket
      ORDER BY CASE aging_bucket
        WHEN 'CURRENT' THEN 1
        WHEN 'DPD_1_7' THEN 2
        WHEN 'DPD_8_30' THEN 3
        WHEN 'DPD_31_60' THEN 4
        WHEN 'DPD_61_90' THEN 5
        WHEN 'DPD_91_120' THEN 6
        ELSE 7
      END;

      SELECT
        @SnapshotDate AS snapshot_date,
        branch_code,
        branch_name,
        asset_category,
        SUM(CASE WHEN aging_bucket = 'CURRENT' THEN 1 ELSE 0 END)
          AS current_contracts,
        SUM(CASE WHEN aging_bucket = 'DPD_1_7' THEN 1 ELSE 0 END)
          AS dpd_1_7_contracts,
        SUM(CASE WHEN aging_bucket = 'DPD_8_30' THEN 1 ELSE 0 END)
          AS dpd_8_30_contracts,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN 1 ELSE 0 END) AS intervention_contracts,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN outstanding_amount ELSE 0 END) AS intervention_outstanding,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN overdue_amount ELSE 0 END) AS intervention_overdue
      FROM #Accounts
      GROUP BY branch_code, branch_name, asset_category
      ORDER BY intervention_contracts DESC, branch_name, asset_category;

      SELECT
        @SnapshotDate AS snapshot_date,
        branch_code,
        branch_name,
        COUNT_BIG(*) AS total_accounts,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN 1 ELSE 0 END) AS dpd_1_30,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN outstanding_amount ELSE 0 END) AS dpd_1_30_amount,
        SUM(CASE WHEN aging_bucket = 'DPD_31_60'
          THEN 1 ELSE 0 END) AS dpd_31_60,
        SUM(CASE WHEN aging_bucket = 'DPD_31_60'
          THEN outstanding_amount ELSE 0 END) AS dpd_31_60_amount,
        SUM(CASE WHEN aging_bucket = 'DPD_61_90'
          THEN 1 ELSE 0 END) AS dpd_61_90,
        SUM(CASE WHEN aging_bucket = 'DPD_61_90'
          THEN outstanding_amount ELSE 0 END) AS dpd_61_90_amount,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN 1 ELSE 0 END) AS dpd_90_plus,
        SUM(CASE WHEN aging_bucket <> 'CURRENT'
          THEN 1 ELSE 0 END) AS dpd_1_plus_accounts,
        SUM(CASE WHEN aging_bucket <> 'CURRENT'
          THEN outstanding_amount ELSE 0 END) AS dpd_1_plus_amount,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_31_60', 'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN 1 ELSE 0 END) AS dpd_30_plus_accounts,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_31_60', 'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN outstanding_amount ELSE 0 END) AS dpd_30_plus_amount,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN 1 ELSE 0 END) AS dpd_60_plus_accounts,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN outstanding_amount ELSE 0 END) AS dpd_60_plus_amount,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN 1 ELSE 0 END) AS dpd_90_plus_accounts,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN outstanding_amount ELSE 0 END) AS dpd_90_plus_amount,
        SUM(outstanding_amount) AS outstanding_amount,
        SUM(overdue_amount) AS overdue_amount
      FROM #Accounts
      GROUP BY branch_code, branch_name
      ORDER BY dpd_90_plus DESC, branch_name;

      SELECT
        @SnapshotDate AS snapshot_date,
        asset_category,
        COUNT_BIG(*) AS total_accounts,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN 1 ELSE 0 END) AS dpd_1_30,
        SUM(CASE WHEN aging_bucket IN ('DPD_1_7', 'DPD_8_30')
          THEN outstanding_amount ELSE 0 END) AS dpd_1_30_amount,
        SUM(CASE WHEN aging_bucket = 'DPD_31_60'
          THEN 1 ELSE 0 END) AS dpd_31_60,
        SUM(CASE WHEN aging_bucket = 'DPD_31_60'
          THEN outstanding_amount ELSE 0 END) AS dpd_31_60_amount,
        SUM(CASE WHEN aging_bucket = 'DPD_61_90'
          THEN 1 ELSE 0 END) AS dpd_61_90,
        SUM(CASE WHEN aging_bucket = 'DPD_61_90'
          THEN outstanding_amount ELSE 0 END) AS dpd_61_90_amount,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN 1 ELSE 0 END) AS dpd_90_plus,
        SUM(CASE WHEN aging_bucket <> 'CURRENT'
          THEN 1 ELSE 0 END) AS dpd_1_plus_accounts,
        SUM(CASE WHEN aging_bucket <> 'CURRENT'
          THEN outstanding_amount ELSE 0 END) AS dpd_1_plus_amount,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_31_60', 'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN 1 ELSE 0 END) AS dpd_30_plus_accounts,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_31_60', 'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN outstanding_amount ELSE 0 END) AS dpd_30_plus_amount,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN 1 ELSE 0 END) AS dpd_60_plus_accounts,
        SUM(CASE WHEN aging_bucket IN (
          'DPD_61_90', 'DPD_91_120', 'DPD_121_PLUS'
        ) THEN outstanding_amount ELSE 0 END) AS dpd_60_plus_amount,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN 1 ELSE 0 END) AS dpd_90_plus_accounts,
        SUM(CASE WHEN aging_bucket IN ('DPD_91_120', 'DPD_121_PLUS')
          THEN outstanding_amount ELSE 0 END) AS dpd_90_plus_amount,
        SUM(outstanding_amount) AS outstanding_amount,
        SUM(overdue_amount) AS overdue_amount
      FROM #Accounts
      GROUP BY asset_category
      ORDER BY dpd_90_plus DESC, asset_category;

      WITH MonthCutoffs AS (
        SELECT
          YEAR(REPORTDATE) AS year_number,
          MONTH(REPORTDATE) AS month_number,
          MAX(REPORTDATE) AS snapshot_date
        FROM dbo.RPT_AGING_ARM
        WHERE YEAR(REPORTDATE) IN (2025, 2026)
          AND REPORTDATE <= CAST(GETDATE() AS date)
        GROUP BY YEAR(REPORTDATE), MONTH(REPORTDATE)
      )
      SELECT
        cutoffs.year_number,
        cutoffs.month_number,
        cutoffs.snapshot_date,
        SUM(CASE WHEN COALESCE(accounts.PASTDUEDAYS, 0) > 90
          THEN CAST(1 AS bigint) ELSE CAST(0 AS bigint) END)
          AS contract_count,
        CAST(
          SUM(CASE WHEN COALESCE(accounts.PASTDUEDAYS, 0) > 90
            THEN COALESCE(accounts.SALDOEOM, 0) ELSE 0 END)
          AS decimal(28,2)
        ) AS outstanding_amount
      FROM MonthCutoffs AS cutoffs
      JOIN dbo.RPT_AGING_ARM AS accounts
        ON accounts.REPORTDATE = cutoffs.snapshot_date
        AND accounts.SALDOEOM > 0
      GROUP BY
        cutoffs.year_number,
        cutoffs.month_number,
        cutoffs.snapshot_date
      ORDER BY cutoffs.year_number, cutoffs.month_number;
    `);

  const [
    summaryRows,
    agingRows,
    interventionRows,
    branchRows,
    assetRows,
    trendRows,
  ] = result.recordsets;
  const branches = new Map();
  const assets = new Set();

  for (const row of interventionRows) {
    branches.set(row.branch_code, {
      branch_code: row.branch_code,
      branch_name: row.branch_name,
    });
    assets.add(row.asset_category);
  }

  response.json({
    data: {
      summary: summaryRows[0] || null,
      aging: agingRows,
      intervention: interventionRows,
      filters: {
        branches: [...branches.values()].sort((left, right) =>
          left.branch_name.localeCompare(right.branch_name),
        ),
        assets: [...assets].sort(),
      },
      accountManagement: {
        byBranch: branchRows,
        byAsset: assetRows,
      },
      dpd90Trend: trendRows,
    },
  });
});

export default router;
