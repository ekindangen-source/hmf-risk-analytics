DECLARE @LatestDate date =
  (SELECT MAX(REPORTDATE) FROM dbo.RPT_AGING_ARM);

SELECT
  @LatestDate AS snapshot_date,

  COALESCE(
    NULLIF(LTRIM(RTRIM(BRANCHCODE)), ''),
    'UNKNOWN'
  ) AS branch_code,

  COALESCE(
    NULLIF(LTRIM(RTRIM(BRANCHNAME)), ''),
    'Unknown Branch'
  ) AS branch_name,

  COALESCE(
    NULLIF(LTRIM(RTRIM(ASSETTYPE)), ''),
    'Unknown Asset'
  ) AS asset_category,

  SUM(
    CASE WHEN COALESCE(PASTDUEDAYS, 0) <= 0
      THEN 1 ELSE 0 END
  ) AS current_contracts,

  SUM(
    CASE WHEN PASTDUEDAYS BETWEEN 1 AND 7
      THEN 1 ELSE 0 END
  ) AS dpd_1_7_contracts,

  SUM(
    CASE WHEN PASTDUEDAYS BETWEEN 8 AND 30
      THEN 1 ELSE 0 END
  ) AS dpd_8_30_contracts,

  SUM(
    CASE WHEN PASTDUEDAYS BETWEEN 1 AND 30
      THEN 1 ELSE 0 END
  ) AS intervention_contracts,

  CAST(SUM(
    CASE WHEN PASTDUEDAYS BETWEEN 1 AND 30
      THEN COALESCE(SALDOEOM, 0) ELSE 0 END
  ) AS decimal(28,2)) AS intervention_outstanding,

  CAST(SUM(
    CASE WHEN PASTDUEDAYS BETWEEN 1 AND 30
      THEN COALESCE(TOTALLATE, 0) ELSE 0 END
  ) AS decimal(28,2)) AS intervention_overdue

FROM dbo.RPT_AGING_ARM
WHERE REPORTDATE = @LatestDate
  AND SALDOEOM > 0
GROUP BY
  COALESCE(NULLIF(LTRIM(RTRIM(BRANCHCODE)), ''), 'UNKNOWN'),
  COALESCE(NULLIF(LTRIM(RTRIM(BRANCHNAME)), ''), 'Unknown Branch'),
  COALESCE(NULLIF(LTRIM(RTRIM(ASSETTYPE)), ''), 'Unknown Asset');
