const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function count(value) {
  return Number(value || 0);
}

function formatCount(value) {
  return count(value).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export default function AccountDpdTrendChart({ rows }) {
  const width = 920;
  const height = 300;
  const left = 62;
  const right = 28;
  const top = 28;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const series = [2026, 2025].map((year) => ({
    year,
    points: rows
      .filter((row) => Number(row.year_number) === year)
      .map((row) => ({
        month: Number(row.month_number),
        value: count(row.contract_count),
        snapshotDate: String(row.snapshot_date).slice(0, 10),
      }))
      .sort((leftPoint, rightPoint) =>
        leftPoint.month - rightPoint.month,
      ),
  }));
  const maximum = Math.max(
    1,
    ...series.flatMap((item) =>
      item.points.map((point) => point.value),
    ),
  );
  const xPosition = (month) =>
    left + ((month - 1) * plotWidth) / 11;
  const yPosition = (value) =>
    top + plotHeight - (count(value) / maximum) * plotHeight;
  const linePoints = (points) =>
    points
      .map((point) =>
        `${xPosition(point.month)},${yPosition(point.value)}`,
      )
      .join(" ");

  return (
    <section className="panel intervention-panel account-trend-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ROLL-RATE MONITORING</p>
          <h2>90+ DPD account trend</h2>
        </div>
        <span className="table-note">
          Monthly cutoff comparison · 2026 vs 2025
        </span>
      </div>

      <div className="account-trend-legend" aria-hidden="true">
        <span><i className="current-year" />2026</span>
        <span><i className="previous-year" />2025</span>
      </div>

      <div className="account-trend-scroll">
        <svg
          className="account-trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Monthly 90 plus DPD account counts for 2026 and 2025"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = top + plotHeight - ratio * plotHeight;

            return (
              <g key={ratio}>
                <line
                  className="account-trend-grid"
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="account-trend-axis"
                  x={left - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {formatCount(maximum * ratio)}
                </text>
              </g>
            );
          })}

          {monthLabels.map((label, index) => (
            <text
              className="account-trend-axis"
              key={label}
              x={xPosition(index + 1)}
              y={height - 18}
              textAnchor="middle"
            >
              {label}
            </text>
          ))}

          {series.map((item) => (
            <g key={item.year}>
              <polyline
                className={`account-trend-line year-${item.year}`}
                points={linePoints(item.points)}
              />
              {item.points.map((point) => (
                <circle
                  className={`account-trend-point year-${item.year}`}
                  key={`${item.year}-${point.month}`}
                  cx={xPosition(point.month)}
                  cy={yPosition(point.value)}
                  r="5"
                >
                  <title>
                    {monthLabels[point.month - 1]} {item.year}: {formatCount(point.value)} accounts · snapshot {point.snapshotDate}
                  </title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
