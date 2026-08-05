BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN ('scheduled', 'manual', 'startup')),
    status TEXT NOT NULL
        CHECK (status IN ('running', 'completed', 'failed')),
    snapshot_date DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    source_server TEXT,
    source_database TEXT,
    rows_extracted INTEGER NOT NULL DEFAULT 0,
    rows_written INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_runs_started_at
    ON refresh_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_kpis (
    snapshot_date DATE PRIMARY KEY,
    total_contracts BIGINT NOT NULL DEFAULT 0,
    total_outstanding NUMERIC(20,2) NOT NULL DEFAULT 0,
    current_contracts BIGINT NOT NULL DEFAULT 0,
    delinquent_contracts BIGINT NOT NULL DEFAULT 0,
    early_intervention_contracts BIGINT NOT NULL DEFAULT 0,
    total_overdue NUMERIC(20,2) NOT NULL DEFAULT 0,
    branch_count INTEGER NOT NULL DEFAULT 0,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    branch_code TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    asset_category TEXT NOT NULL DEFAULT 'ALL',
    aging_bucket TEXT NOT NULL,
    contract_count BIGINT NOT NULL DEFAULT 0,
    outstanding_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
    overdue_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
    installment_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_portfolio_metrics
        UNIQUE (
            snapshot_date,
            branch_code,
            asset_category,
            aging_bucket
        ),

    CONSTRAINT ck_portfolio_nonnegative
        CHECK (
            contract_count >= 0
            AND outstanding_amount >= 0
            AND overdue_amount >= 0
            AND installment_amount >= 0
        )
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshot_branch
    ON portfolio_metrics (snapshot_date DESC, branch_code);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshot_asset
    ON portfolio_metrics (snapshot_date DESC, asset_category);

CREATE TABLE IF NOT EXISTS early_intervention_metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    branch_code TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    asset_category TEXT NOT NULL DEFAULT 'ALL',
    current_contracts BIGINT NOT NULL DEFAULT 0,
    dpd_1_7_contracts BIGINT NOT NULL DEFAULT 0,
    dpd_8_30_contracts BIGINT NOT NULL DEFAULT 0,
    intervention_contracts BIGINT NOT NULL DEFAULT 0,
    intervention_outstanding NUMERIC(20,2) NOT NULL DEFAULT 0,
    intervention_overdue NUMERIC(20,2) NOT NULL DEFAULT 0,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_early_intervention
        UNIQUE (
            snapshot_date,
            branch_code,
            asset_category
        ),

    CONSTRAINT ck_intervention_nonnegative
        CHECK (
            current_contracts >= 0
            AND dpd_1_7_contracts >= 0
            AND dpd_8_30_contracts >= 0
            AND intervention_contracts >= 0
            AND intervention_outstanding >= 0
            AND intervention_overdue >= 0
        )
);

CREATE INDEX IF NOT EXISTS idx_intervention_snapshot_branch
    ON early_intervention_metrics (snapshot_date DESC, branch_code);

CREATE INDEX IF NOT EXISTS idx_intervention_snapshot_asset
    ON early_intervention_metrics (snapshot_date DESC, asset_category);

COMMIT;
