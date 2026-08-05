import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "/api";

const agingOrder = [
  "CURRENT",
  "DPD_1_7",
  "DPD_8_30",
  "DPD_31_60",
  "DPD_61_90",
  "DPD_91_120",
  "DPD_121_PLUS",
];

const agingLabels = {
  CURRENT: "Current",
  DPD_1_7: "1–7",
  DPD_8_30: "8–30",
  DPD_31_60: "31–60",
  DPD_61_90: "61–90",
  DPD_91_120: "91–120",
  DPD_121_PLUS: "121+",
};

function number(value) {
  return Number(value || 0);
}

function integer(value) {
  return number(value).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function money(value) {
  const amount = number(value);

  return `IDR ${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function percentage(value, total) {
  if (!number(total)) return "0.00%";
  return `${((number(value) / number(total)) * 100).toFixed(2)}%`;
}

function dateLabel(value) {
  if (!value) return "No snapshot";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function getJson(path, options) {
  const response = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }

  return response.json();
}

export default function App() {
  const [summary, setSummary] = useState(null);
  const [aging, setAging] = useState([]);
  const [intervention, setIntervention] = useState([]);
  const [filters, setFilters] = useState({
    branches: [],
    assets: [],
  });
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setError("");

    try {
      const [
        summaryResponse,
        agingResponse,
        interventionResponse,
        filtersResponse,
      ] = await Promise.all([
        getJson("/dashboard/summary"),
        getJson("/dashboard/aging"),
        getJson("/dashboard/early-intervention"),
        getJson("/dashboard/filters"),
      ]);

      setSummary(summaryResponse.data);
      setAging(agingResponse.data || []);
      setIntervention(interventionResponse.data || []);
      setFilters(filtersResponse.data || {
        branches: [],
        assets: [],
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function refreshDashboard() {
    setRefreshing(true);
    setError("");

    try {
      await getJson("/admin/refresh", {
        method: "POST",
      });

      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  const agingMap = useMemo(
    () => new Map(aging.map((row) => [row.aging_bucket, row])),
    [aging],
  );

  const delinquent30 = useMemo(
    () =>
      ["DPD_31_60", "DPD_61_90", "DPD_91_120", "DPD_121_PLUS"]
        .reduce(
          (total, bucket) =>
            total + number(agingMap.get(bucket)?.contract_count),
          0,
        ),
    [agingMap],
  );

  const delinquent90 = useMemo(
    () =>
      ["DPD_91_120", "DPD_121_PLUS"].reduce(
        (total, bucket) =>
          total + number(agingMap.get(bucket)?.contract_count),
        0,
      ),
    [agingMap],
  );

  const maxAgingContracts = Math.max(
    1,
    ...aging.map((row) => number(row.contract_count)),
  );

  const filteredIntervention = useMemo(
    () =>
      intervention.filter((row) => {
        const branchMatches =
          branchFilter === "ALL" ||
          row.branch_code === branchFilter;

        const assetMatches =
          assetFilter === "ALL" ||
          row.asset_category === assetFilter;

        return branchMatches && assetMatches;
      }),
    [intervention, branchFilter, assetFilter],
  );

  const branchIntervention = useMemo(() => {
    const grouped = new Map();

    for (const row of filteredIntervention) {
      const current = grouped.get(row.branch_code) || {
        branch_code: row.branch_code,
        branch_name: row.branch_name,
        dpd_1_7_contracts: 0,
        dpd_8_30_contracts: 0,
        intervention_contracts: 0,
        intervention_outstanding: 0,
        intervention_overdue: 0,
      };

      current.dpd_1_7_contracts += number(row.dpd_1_7_contracts);
      current.dpd_8_30_contracts += number(row.dpd_8_30_contracts);
      current.intervention_contracts += number(
        row.intervention_contracts,
      );
      current.intervention_outstanding += number(
        row.intervention_outstanding,
      );
      current.intervention_overdue += number(
        row.intervention_overdue,
      );

      grouped.set(row.branch_code, current);
    }

    return [...grouped.values()].sort(
      (a, b) =>
        b.intervention_contracts - a.intervention_contracts,
    );
  }, [filteredIntervention]);

  const topBranch = branchIntervention[0];

  if (loading) {
    return (
      <main className="state-screen">
        <div className="spinner" />
        <p>Loading portfolio snapshot…</p>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark">H</span>
          <span>HMF <b>Portfolio Risk</b></span>
        </a>

        <div className="top-actions">
          <span className="privacy-status">
            Aggregate data only
          </span>

          <button
            className="refresh-button"
            onClick={refreshDashboard}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          Dashboard error: {error}
        </div>
      )}

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">EXECUTIVE RISK OVERVIEW</p>
          <h1>Portfolio position</h1>
          <p className="subtitle">
            Active consumer-finance contracts from the read-only
            analytics replica
          </p>
        </div>

        <div className="snapshot">
          <span>Latest snapshot</span>
          <strong>{dateLabel(summary?.snapshot_date)}</strong>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi primary">
          <p>Outstanding balance</p>
          <strong>{money(summary?.total_outstanding)}</strong>
          <span>
            {integer(summary?.total_contracts)} active contracts
          </span>
        </article>

        <article className="kpi">
          <p>Total arrears</p>
          <strong>{money(summary?.total_overdue)}</strong>
          <span className="negative">
            {percentage(
              summary?.total_overdue,
              summary?.total_outstanding,
            )} of outstanding
          </span>
        </article>

        <article className="kpi">
          <p>30+ DPD</p>
          <strong>
            {percentage(delinquent30, summary?.total_contracts)}
          </strong>
          <span>{integer(delinquent30)} contracts</span>
        </article>

        <article className="kpi">
          <p>Early intervention</p>
          <strong>
            {integer(summary?.early_intervention_contracts)}
          </strong>
          <span className="negative">
            1–30 days past due
          </span>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel dpd-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PORTFOLIO HEALTH</p>
              <h2>Delinquency distribution</h2>
            </div>
          </div>

          <div className="dpd-list">
            {agingOrder.map((bucket) => {
              const row = agingMap.get(bucket);
              const count = number(row?.contract_count);
              const tone =
                bucket === "CURRENT"
                  ? "current"
                  : ["DPD_1_7", "DPD_8_30"].includes(bucket)
                    ? "watch"
                    : ["DPD_31_60", "DPD_61_90"].includes(bucket)
                      ? "late"
                      : "critical";

              return (
                <div className="dpd-row" key={bucket}>
                  <span className="dpd-label">
                    {agingLabels[bucket]}
                  </span>
                  <div className="bar-track">
                    <div
                      className={`bar ${tone}`}
                      style={{
                        width: `${Math.max(
                          2,
                          (count / maxAgingContracts) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <strong>{integer(count)}</strong>
                  <span className="exposure">
                    {money(row?.outstanding_amount)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="insight">
            <span>!</span>
            <p>
              <strong>
                {integer(delinquent90)} contracts are at 90+ DPD.
              </strong>
              <br />
              These accounts require intensive recovery rather than
              standard early intervention.
            </p>
          </div>
        </article>

        <aside className="panel focus-panel">
          <p className="eyebrow">TODAY&apos;S FOCUS</p>
          <h2>Collection priorities</h2>

          <div className="priority-card amber">
            <span>01</span>
            <div>
              <strong>Early intervention</strong>
              <p>
                {integer(summary?.early_intervention_contracts)}
                {" "}contracts · 1–30 DPD
              </p>
            </div>
          </div>

          <div className="priority-card red">
            <span>02</span>
            <div>
              <strong>Intensive recovery</strong>
              <p>{integer(delinquent90)} contracts · 90+ DPD</p>
            </div>
          </div>

          <div className="priority-card blue">
            <span>03</span>
            <div>
              <strong>Highest intervention volume</strong>
              <p>
                {topBranch
                  ? `${topBranch.branch_name} · ${integer(
                      topBranch.intervention_contracts,
                    )} contracts`
                  : "No branch data"}
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="panel intervention-panel">
        <div className="panel-heading intervention-heading">
          <div>
            <p className="eyebrow">EARLY INTERVENTION</p>
            <h2>Branch and asset breakdown</h2>
          </div>

          <div className="filters">
            <label>
              Branch
              <select
                value={branchFilter}
                onChange={(event) =>
                  setBranchFilter(event.target.value)
                }
              >
                <option value="ALL">All branches</option>
                {filters.branches.map((branch) => (
                  <option
                    key={branch.branch_code}
                    value={branch.branch_code}
                  >
                    {branch.branch_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Asset
              <select
                value={assetFilter}
                onChange={(event) =>
                  setAssetFilter(event.target.value)
                }
              >
                <option value="ALL">All assets</option>
                {filters.assets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>1–7 DPD</th>
                <th>8–30 DPD</th>
                <th>Total intervention</th>
                <th>Outstanding</th>
                <th>Arrears</th>
              </tr>
            </thead>

            <tbody>
              {branchIntervention.map((row) => (
                <tr key={row.branch_code}>
                  <td>
                    <span className="branch-code">
                      {row.branch_code}
                    </span>
                    <strong>{row.branch_name}</strong>
                  </td>
                  <td>{integer(row.dpd_1_7_contracts)}</td>
                  <td>{integer(row.dpd_8_30_contracts)}</td>
                  <td className="rate">
                    {integer(row.intervention_contracts)}
                  </td>
                  <td>{money(row.intervention_outstanding)}</td>
                  <td>{money(row.intervention_overdue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <span>HMF Portfolio Risk · Stage 1</span>
        <span>
          No personally identifiable information · Read-only source
        </span>
      </footer>
    </main>
  );
}
