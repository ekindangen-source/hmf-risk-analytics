import { useEffect, useMemo, useState } from "react";
import "./App.css";
import LoginPage from "./components/LoginPage.jsx";
import UserProfile from "./components/UserProfile.jsx";
import SalesBranch from "./pages/SalesBranch.jsx";
import AccountDrilldown from "./components/AccountDrilldown.jsx";
import AccountDpdTrendChart from "./components/AccountDpdTrendChart.jsx";

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

function moneyBillions(value) {
  return `IDR ${(number(value) / 1_000_000_000).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  )} B`;
}

function percentage(value, total) {
  if (!number(total)) return "0.00%";
  return `${((number(value) / number(total)) * 100).toFixed(2)}%`;
}


function updateDateTime(value) {
  if (!value) return "Update unavailable";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

  return `${formatted} WIB`;
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

function monthLabel(value) {
  if (!value) return "Select month";

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
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
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const response = await getJson("/auth/me");

        if (active) setAuthUser(response.data);
      } catch {
        if (active) setAuthUser(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    try {
      await getJson("/auth/logout", {
        method: "POST",
      });
    } catch {
      // Clear the local authenticated state regardless.
    }

    setAuthUser(null);
    setAccountDrilldown(null);
  }
  const [activePage, setActivePage] = useState(() =>
    window.location.hash === "#accounts"
      ? "account"
      : "sales"
  );
  const [accountBranchPage, setAccountBranchPage] = useState(1);
  const [accountBranchSort, setAccountBranchSort] = useState({
    key: "dpd_90_plus",
    direction: "desc",
  });
  const [accountDrilldown, setAccountDrilldown] =
    useState(null);

  function navigatePage(page) {
    const hash = page === "sales"
      ? "#sales"
      : "#accounts";

    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setActivePage(page);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    function handleHashChange() {
      setActivePage(
        window.location.hash === "#accounts"
          ? "account"
          : "sales",
      );
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener(
        "hashchange",
        handleHashChange,
      );
    };
  }, []);

  const [summary, setSummary] = useState(null);
  const [aging, setAging] = useState([]);
  const [intervention, setIntervention] = useState([]);
  const [accountManagement, setAccountManagement] = useState({
    byBranch: [],
    byAsset: [],
  });
  const [dpd90Trend, setDpd90Trend] = useState([]);
  const [filters, setFilters] = useState({
    branches: [],
    assets: [],
  });
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [accountMonths, setAccountMonths] = useState([]);
  const [accountMonth, setAccountMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard(requestedMonth = accountMonth) {
    setLoading(true);
    setError("");

    try {
      let month = requestedMonth;

      if (!month) {
        const monthsResponse = await getJson("/account-periods/months");
        const months = monthsResponse.data || [];

        if (!months.length) {
          throw new Error("No account cutoff months are available");
        }

        setAccountMonths(months);
        month = months[0].month;
        setAccountMonth(month);
      }

      const overviewResponse = await getJson(
        `/account-periods/overview?month=${encodeURIComponent(month)}`,
      );
      const data = overviewResponse.data || {};

      setSummary(data.summary || null);
      setAging(data.aging || []);
      setIntervention(data.intervention || []);
      setFilters(data.filters || {
        branches: [],
        assets: [],
      });
      setAccountManagement(data.accountManagement || {
        byBranch: [],
        byAsset: [],
      });
      setDpd90Trend(data.dpd90Trend || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authUser) loadDashboard();
  }, [authUser]);

  async function changeAccountMonth(event) {
    const month = event.target.value;

    setAccountMonth(month);
    setBranchFilter("ALL");
    setAssetFilter("ALL");
    setAccountBranchPage(1);
    setAccountDrilldown(null);
    await loadDashboard(month);
  }

  async function refreshDashboard() {
    setRefreshing(true);
    setError("");

    try {
      await getJson("/admin/refresh", {
        method: "POST",
      });

      await loadDashboard(accountMonth);
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

  const dpd1To30Amount = useMemo(
    () =>
      ["DPD_1_7", "DPD_8_30"].reduce(
        (total, bucket) =>
          total + number(
            agingMap.get(bucket)?.outstanding_amount,
          ),
        0,
      ),
    [agingMap],
  );

  const dpd31To60Amount = useMemo(
    () =>
      number(
        agingMap.get("DPD_31_60")?.outstanding_amount,
      ),
    [agingMap],
  );

  const dpd61To90Amount = useMemo(
    () =>
      number(
        agingMap.get("DPD_61_90")?.outstanding_amount,
      ),
    [agingMap],
  );

  const dpd90PlusAmount = useMemo(
    () =>
      ["DPD_91_120", "DPD_121_PLUS"].reduce(
        (total, bucket) =>
          total + number(
            agingMap.get(bucket)?.outstanding_amount,
          ),
        0,
      ),
    [agingMap],
  );

  const totalDelinquentExposure =
    dpd1To30Amount +
    dpd31To60Amount +
    dpd61To90Amount +
    dpd90PlusAmount;

  const maxAgingContracts = Math.max(
    1,
    ...aging.map((row) => number(row.contract_count)),
  );

  const agingPercentages = useMemo(() => {
    const counts = agingOrder.map((bucket) =>
      number(agingMap.get(bucket)?.contract_count),
    );
    const total = counts.reduce((sum, count) => sum + count, 0);

    if (!total) {
      return new Map(agingOrder.map((bucket) => [bucket, 0]));
    }

    const allocations = counts.map((count, index) => {
      const exactTenths = (count / total) * 1000;

      return {
        index,
        tenths: Math.floor(exactTenths),
        remainder: exactTenths - Math.floor(exactTenths),
      };
    });
    let unallocatedTenths =
      1000 - allocations.reduce((sum, row) => sum + row.tenths, 0);

    [...allocations]
      .sort((left, right) => right.remainder - left.remainder)
      .forEach((row) => {
        if (unallocatedTenths > 0) {
          allocations[row.index].tenths += 1;
          unallocatedTenths -= 1;
        }
      });

    return new Map(
      agingOrder.map((bucket, index) => [
        bucket,
        allocations[index].tenths / 10,
      ]),
    );
  }, [agingMap]);

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
  const accountBranches = accountManagement.byBranch || [];
  const accountAssets = accountManagement.byAsset || [];
  const highest90Branch = accountBranches[0];

  const sortedAccountBranches = useMemo(() => {
    const rows = [...accountBranches];
    const { key, direction } = accountBranchSort;

    rows.sort((left, right) => {
      const leftValue = left[key];
      const rightValue = right[key];

      const leftMissing =
        leftValue === null || leftValue === undefined;
      const rightMissing =
        rightValue === null || rightValue === undefined;

      if (leftMissing && rightMissing) return 0;
      if (leftMissing) return 1;
      if (rightMissing) return -1;

      const comparison =
        key === "branch_name"
          ? String(leftValue).localeCompare(
              String(rightValue),
            )
          : Number(leftValue) - Number(rightValue);

      return direction === "asc"
        ? comparison
        : -comparison;
    });

    return rows;
  }, [accountBranches, accountBranchSort]);

  function changeAccountBranchSort(key) {
    setAccountBranchSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc"
          ? "desc"
          : "asc",
    }));

    setAccountBranchPage(1);
  }

  function accountSortIndicator(key) {
    if (accountBranchSort.key !== key) return "↕";

    return accountBranchSort.direction === "asc"
      ? "↑"
      : "↓";
  }

  const accountBranchPageCount = Math.max(
    1,
    Math.ceil(sortedAccountBranches.length / 10),
  );

  const safeAccountBranchPage = Math.min(
    accountBranchPage,
    accountBranchPageCount,
  );

  const paginatedAccountBranches =
    sortedAccountBranches.slice(
      (safeAccountBranchPage - 1) * 10,
      safeAccountBranchPage * 10,
    );

  if (authLoading) {
    return (
      <main className="state-screen">
        <div className="spinner" />
        <p>Checking secure session…</p>
      </main>
    );
  }

  if (!authUser) {
    return (
      <LoginPage
        apiBase={API}
        onLogin={(user) => {
          window.location.hash = "#sales";
          setActivePage("sales");
          setAuthUser(user);
        }}
      />
    );
  }

  if (activePage === "sales") {
    return (
      <SalesBranch
        onNavigate={navigatePage}
        onRefreshAll={refreshDashboard}
        refreshingAll={refreshing}
        user={authUser}
        onUserChange={setAuthUser}
        onLogout={logout}
      />
    );
  }

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
          <span>HMF <b>Management Dashboard</b></span>
        </a>

        <nav className="section-nav">
          <button onClick={() => navigatePage("sales")}>
            Sales
          </button>
          <button className="active">
            Accounts
          </button>
        </nav>

        <div className="top-actions">
          <span className="last-data-update">
            <small>Data updated</small>
            <strong>
              {updateDateTime(summary?.refreshed_at)}
            </strong>
          </span>

          <UserProfile
            apiBase={API}
            user={authUser}
            onUserChange={setAuthUser}
            onLogout={logout}
          />

          {authUser.role === "admin" && (
            <button
              className="refresh-button"
              onClick={refreshDashboard}
              disabled={refreshing}
            >
              {refreshing
                ? "Refreshing…"
                : "Refresh data"}
            </button>
          )}
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

        <div className="account-cutoff">
          <label>
            <span>Cutoff month</span>
            <select
              value={accountMonth}
              onChange={changeAccountMonth}
              disabled={loading || !accountMonths.length}
            >
              {accountMonths.map((row) => (
                <option key={row.month} value={row.month}>
                  {monthLabel(row.month)}
                </option>
              ))}
            </select>
          </label>
          <small>
            Snapshot <strong>{dateLabel(summary?.snapshot_date)}</strong>
          </small>
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
          <p>1–30 DPD exposure</p>
          <strong>{moneyBillions(dpd1To30Amount)}</strong>
          <span className="negative">
            {percentage(
              dpd1To30Amount,
              summary?.total_outstanding,
            )} of total outstanding
          </span>
        </article>

        <article className="kpi">
          <p>31–60 DPD exposure</p>
          <strong>{moneyBillions(dpd31To60Amount)}</strong>
          <span className="negative">
            {percentage(
              dpd31To60Amount,
              summary?.total_outstanding,
            )} of total outstanding
          </span>
        </article>

        <article className="kpi">
          <p>61–90 DPD exposure</p>
          <strong>{moneyBillions(dpd61To90Amount)}</strong>
          <span className="negative">
            {percentage(
              dpd61To90Amount,
              summary?.total_outstanding,
            )} of total outstanding
          </span>
        </article>

        <article className="kpi">
          <p>90+ DPD exposure</p>
          <strong>{moneyBillions(dpd90PlusAmount)}</strong>
          <span className="negative">
            {percentage(
              dpd90PlusAmount,
              summary?.total_outstanding,
            )} of total outstanding
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
                  <span className="dpd-percentage">
                    {agingPercentages.get(bucket).toFixed(1)}%
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
              <strong>30+ DPD portfolio</strong>
              <p>
                {integer(delinquent30)} accounts require recovery
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
              <strong>Highest 90+ DPD volume</strong>
              <p>
                {highest90Branch
                  ? `${highest90Branch.branch_name} · ${integer(
                      highest90Branch.dpd_90_plus,
                    )} accounts`
                  : "No branch data"}
              </p>
            </div>
          </div>
        </aside>
      </section>

      <AccountDpdTrendChart rows={dpd90Trend} />

      <section className="panel intervention-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ACCOUNT MANAGEMENT BRANCH</p>
            <h2>Delinquency by branch</h2>
          </div>
          <span className="table-note">
            Sorted by highest 90+ DPD volume
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("branch_name")
                    }
                  >
                    Branch {accountSortIndicator("branch_name")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("total_accounts")
                    }
                  >
                    Total accounts
                    {" "}
                    {accountSortIndicator("total_accounts")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("dpd_1_30")
                    }
                  >
                    1–30 DPD {accountSortIndicator("dpd_1_30")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("dpd_31_60")
                    }
                  >
                    31–60 DPD
                    {" "}
                    {accountSortIndicator("dpd_31_60")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("dpd_61_90")
                    }
                  >
                    61–90 DPD
                    {" "}
                    {accountSortIndicator("dpd_61_90")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("dpd_90_plus")
                    }
                  >
                    90+ DPD
                    {" "}
                    {accountSortIndicator("dpd_90_plus")}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort(
                        "outstanding_amount"
                      )
                    }
                  >
                    Outstanding
                    {" "}
                    {accountSortIndicator(
                      "outstanding_amount"
                    )}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      changeAccountBranchSort("overdue_amount")
                    }
                  >
                    Arrears
                    {" "}
                    {accountSortIndicator("overdue_amount")}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {paginatedAccountBranches.map((row) => (
                <tr key={row.branch_code}>
                  <td>
                    <span className="branch-code">
                      {row.branch_code}
                    </span>
                    <strong>{row.branch_name}</strong>
                  </td>
                  <td>{integer(row.total_accounts)}</td>
                  <td>
                    <button
                      className="drilldown-link"
                      onClick={() =>
                        setAccountDrilldown({
                          branchCode: row.branch_code,
                          branchName: row.branch_name,
                          snapshotDate: String(
                            row.snapshot_date,
                          ).slice(0, 10),
                          bucket: "dpd_1_30",
                        })
                      }
                    >
                      {integer(row.dpd_1_30)}
                    </button>
                  </td>
                  <td>
                    <button
                      className="drilldown-link"
                      onClick={() =>
                        setAccountDrilldown({
                          branchCode: row.branch_code,
                          branchName: row.branch_name,
                          snapshotDate: String(
                            row.snapshot_date,
                          ).slice(0, 10),
                          bucket: "dpd_31_60",
                        })
                      }
                    >
                      {integer(row.dpd_31_60)}
                    </button>
                  </td>
                  <td>
                    <button
                      className="drilldown-link"
                      onClick={() =>
                        setAccountDrilldown({
                          branchCode: row.branch_code,
                          branchName: row.branch_name,
                          snapshotDate: String(
                            row.snapshot_date,
                          ).slice(0, 10),
                          bucket: "dpd_61_90",
                        })
                      }
                    >
                      {integer(row.dpd_61_90)}
                    </button>
                  </td>
                  <td className="rate">
                    <button
                      className="drilldown-link critical"
                      onClick={() =>
                        setAccountDrilldown({
                          branchCode: row.branch_code,
                          branchName: row.branch_name,
                          snapshotDate: String(
                            row.snapshot_date,
                          ).slice(0, 10),
                          bucket: "dpd_90_plus",
                        })
                      }
                    >
                      {integer(row.dpd_90_plus)}
                    </button>
                  </td>
                  <td>{money(row.outstanding_amount)}</td>
                  <td>{money(row.overdue_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>
            Showing {(safeAccountBranchPage - 1) * 10 + 1}
            –{Math.min(
              safeAccountBranchPage * 10,
              accountBranches.length,
            )} of {accountBranches.length} branches
          </span>

          <div>
            <button
              onClick={() =>
                setAccountBranchPage((page) =>
                  Math.max(1, page - 1)
                )
              }
              disabled={safeAccountBranchPage === 1}
            >
              Previous
            </button>

            <strong>
              {safeAccountBranchPage} / {accountBranchPageCount}
            </strong>

            <button
              onClick={() =>
                setAccountBranchPage((page) =>
                  Math.min(accountBranchPageCount, page + 1)
                )
              }
              disabled={
                safeAccountBranchPage === accountBranchPageCount
              }
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="panel intervention-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ASSET RISK</p>
            <h2>Cumulative delinquency exposure by asset</h2>
          </div>
          <span className="table-note">
            Total delinquent exposure: {moneyBillions(
              totalDelinquentExposure,
            )}
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Total accounts</th>
                <th>1–30 DPD</th>
                <th>31–60 DPD</th>
                <th>61–90 DPD</th>
                <th>90+ DPD</th>
                <th>Total outstanding</th>
              </tr>
            </thead>

            <tbody>
              {accountAssets.map((row) => (
                <tr key={row.asset_category}>
                  <td>
                    <strong>{row.asset_category}</strong>
                  </td>
                  <td>{integer(row.total_accounts)}</td>
                  <td className="dpd-metric">
                    <strong>
                      {moneyBillions(row.dpd_1_30_amount)}
                    </strong>
                    <small>
                      {integer(row.dpd_1_30)} accounts
                    </small>
                  </td>
                  <td className="dpd-metric">
                    <strong>
                      {moneyBillions(row.dpd_31_60_amount)}
                    </strong>
                    <small>
                      {integer(row.dpd_31_60)} accounts
                    </small>
                  </td>
                  <td className="dpd-metric">
                    <strong>
                      {moneyBillions(row.dpd_61_90_amount)}
                    </strong>
                    <small>
                      {integer(row.dpd_61_90)} accounts
                    </small>
                  </td>
                  <td className="dpd-metric rate">
                    <strong>
                      {moneyBillions(row.dpd_90_plus_amount)}
                    </strong>
                    <small>
                      {integer(row.dpd_90_plus)} accounts
                    </small>
                  </td>
                  <td>{moneyBillions(row.outstanding_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {accountDrilldown && (
        <AccountDrilldown
          key={`${accountDrilldown.branchCode}-${accountDrilldown.bucket}`}
          apiBase={API}
          selection={accountDrilldown}
          onClose={() => setAccountDrilldown(null)}
        />
      )}

      <footer>
        <span>HMF Portfolio Risk · Stage 1</span>
        <span>
          No personally identifiable information · Read-only source
        </span>
      </footer>
    </main>
  );
}
