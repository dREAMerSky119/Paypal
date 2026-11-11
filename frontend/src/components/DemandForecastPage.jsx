
import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  RefreshCw,
  TrendingUp,
  Waves,
  Target,
  AlertCircle,
} from "lucide-react";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

import { api } from "../lib/api.js";
import "../demand-forecast.css";

const COLORS = {
  slate: "#596D82",
  deep: "#344454",
  sage: "#82968D",
  taupe: "#A9947A",
  beige: "#F5F1E8",
};

const formatNumber = (value) =>
  Number(value || 0).toFixed(1);

const formatPeriod = (period) => {
  if (!period) return "";

  const [year, month] = period.split("-");

  return new Date(
    Number(year),
    Number(month) - 1,
    1
  ).toLocaleDateString("en", {
    month: "short",
    year: "2-digit",
  });
};

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  if (!point) return null;

  return (
    <div className="forecast-tooltip">
      <strong>{formatPeriod(label)}</strong>

      {point.actual != null && (
        <div>
          <span className="tooltip-dot actual-dot" />
          Historical demand: <b>{formatNumber(point.actual)}</b>
        </div>
      )}

      {point.predicted != null && (
        <div>
          <span className="tooltip-dot predicted-dot" />
          Predicted demand: <b>{formatNumber(point.predicted)}</b>
        </div>
      )}

      {point.lower != null && point.upper != null && (
        <div className="tooltip-range">
          Estimated range: {formatNumber(point.lower)} –{" "}
          {formatNumber(point.upper)}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, trend }) {
  return (
    <div className="forecast-metric">
      <div className="forecast-metric-top">
        <span>{label}</span>

        <div className="forecast-metric-icon">
          <Icon size={18} />
        </div>
      </div>

      <div className="forecast-metric-value">{value}</div>

      <div className="forecast-metric-detail">
        {trend != null &&
          (trend >= 0
            ? <ArrowUpRight size={15} />
            : <ArrowDownRight size={15} />)}

        {detail}
      </div>
    </div>
  );
}

export default function DemandForecastPage() {
  const [destinations, setDestinations] = useState([]);
  const [destination, setDestination] = useState("dolomites-italy");
  const [horizon, setHorizon] = useState(6);

  const [forecastData, setForecastData] = useState(null);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  // Load available destinations.
  useEffect(() => {
    let active = true;

    async function loadDestinations() {
      try {
        const result = await api("/forecast/destinations");

        if (!active) return;

        const items = result.destinations || [];

        setDestinations(items);

        if (items.length > 0) {
          setDestination((current) =>
            items.some((item) => item.slug === current)
              ? current
              : items[0].slug
          );
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load destinations.");
        }
      } finally {
        if (active) {
          setLoadingDestinations(false);
        }
      }
    }

    loadDestinations();

    return () => {
      active = false;
    };
  }, []);

  // Fetch forecast whenever destination, period, or reload key changes.
  useEffect(() => {
    if (!destination) return;

    let active = true;

    async function loadForecast() {
      setLoadingForecast(true);
      setError("");

      try {
        const result = await api(
          `/forecast/demand?destination=${encodeURIComponent(destination)}&horizon=${horizon}`
        );

        if (active) {
          setForecastData(result);
        }
      } catch (err) {
        if (active) {
          setForecastData(null);
          setError(
            err.message || "Unable to generate demand forecast."
          );
        }
      } finally {
        if (active) {
          setLoadingForecast(false);
        }
      }
    }

    loadForecast();

    return () => {
      active = false;
    };
  }, [destination, horizon, reloadKey]);

  // Combine historical and forecast records.
  const chartData = useMemo(() => {
    if (!forecastData) return [];

    const historical = forecastData.historical || [];
    const predictions = forecastData.forecast || [];

    const historyPoints = historical.map((item) => ({
      period: item.period,
      actual: item.actual,
      predicted: null,
      lower: null,
      upper: null,
      bandWidth: null,
    }));

    const lastHistorical = historical[historical.length - 1];

    if (lastHistorical && historyPoints.length > 0) {
      historyPoints[historyPoints.length - 1].predicted =
        lastHistorical.actual;
    }

    const futurePoints = predictions.map((item) => ({
      period: item.period,
      actual: null,
      predicted: item.predicted,
      lower: item.lower,
      upper: item.upper,
      bandWidth: Math.max(0, item.upper - item.lower),
    }));

    return [...historyPoints, ...futurePoints];
  }, [forecastData]);

  // Calculate forecast metrics.
  const metrics = useMemo(() => {
    if (!forecastData?.forecast?.length) return null;

    const forecasts = forecastData.forecast;

    const average =
      forecasts.reduce(
        (sum, item) => sum + item.predicted,
        0
      ) / forecasts.length;

    const peak = forecasts.reduce(
      (best, item) =>
        item.predicted > best.predicted ? item : best,
      forecasts[0]
    );

    const lowest = forecasts.reduce(
      (best, item) =>
        item.predicted < best.predicted ? item : best,
      forecasts[0]
    );

    return {
      average,
      peak,
      lowest,
      growth: forecastData.growth_rate,
    };
  }, [forecastData]);

  // Prepare seasonal data.
  const seasonalityData = useMemo(() => {
    if (!forecastData?.seasonality) return [];

    return forecastData.seasonality.map((item) => ({
      ...item,
      demand: item.index * 100,
    }));
  }, [forecastData]);

  const selectedDestination = destinations.find(
    (item) => item.slug === destination
  );

  return (
    <div className="demand-forecast-page">

      {/* Page heading */}
      <div className="forecast-heading">
        <div>
          <div className="forecast-eyebrow">
            <Waves size={14} />
            LOOK A LITTLE FURTHER
          </div>

          <h1>Demand forecasting</h1>

          <p>
            Understand seasonal patterns, anticipate destination demand,
            and identify opportunities before they emerge.
          </p>
        </div>

        <div className="forecast-data-status">
          <span className="status-dot" />
          Model-based forecast
        </div>
      </div>

      {/* Filters */}
      <div className="forecast-controls">

        <div className="forecast-control-group">
          <label htmlFor="forecast-destination">
            DESTINATION
          </label>

          <select
            id="forecast-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            disabled={loadingDestinations}
          >
            {destinations.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="forecast-control-group">
          <label>FORECAST PERIOD</label>

          <div className="forecast-period-selector">
            {[3, 6, 12].map((period) => (
              <button
                key={period}
                type="button"
                className={horizon === period ? "active" : ""}
                onClick={() => setHorizon(period)}
              >
                {period} months
              </button>
            ))}
          </div>
        </div>

        <div className="forecast-updated">
          <CalendarDays size={16} />
          Historical through {forecastData?.latest_period || "—"}
        </div>
      </div>

      {/* Loading and error states */}
      {error && (
        <div className="forecast-error">
          <AlertCircle size={18} />
          {error}

          <button
            type="button"
            onClick={() =>
              setReloadKey((current) => current + 1)
            }
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {(loadingForecast || loadingDestinations) && (
        <div className="forecast-loading">
          <RefreshCw size={18} className="forecast-spinner" />
          Preparing destination forecast...
        </div>
      )}

      {!loadingForecast &&
        !loadingDestinations &&
        forecastData &&
        metrics && (
          <>

            {/* Destination summary */}
            <div className="forecast-destination-intro">
              <div>
                <span>DESTINATION OUTLOOK</span>
                <h2>
                  {selectedDestination?.name || destination}
                </h2>
              </div>

              <div className="forecast-model-label">
                <Activity size={15} />
                {forecastData.model || "Seasonal trend projection"}
              </div>
            </div>

            {/* Metric cards */}
            <div className="forecast-metrics-grid">

              <MetricCard
                icon={Target}
                label="Average predicted demand"
                value={formatNumber(metrics.average)}
                detail="Demand index across forecast period"
              />

              <MetricCard
                icon={TrendingUp}
                label="Historical growth"
                value={`${metrics.growth >= 0 ? "+" : ""}${formatNumber(metrics.growth)}%`}
                detail="Latest 12 months vs previous 12 months"
                trend={metrics.growth}
              />

              <MetricCard
                icon={ArrowUpRight}
                label="Peak forecast month"
                value={formatNumber(metrics.peak.predicted)}
                detail={formatPeriod(metrics.peak.period)}
              />

              <MetricCard
                icon={ArrowDownRight}
                label="Lowest forecast month"
                value={formatNumber(metrics.lowest.predicted)}
                detail={formatPeriod(metrics.lowest.period)}
              />

            </div>

            {/* Main forecast chart */}
            <section className="forecast-panel forecast-main-panel">

              <div className="forecast-panel-heading">
                <div>
                  <span className="forecast-section-label">
                    DEMAND OUTLOOK
                  </span>

                  <h3>Historical vs predicted demand</h3>

                  <p>
                    Monthly demand index with an estimated uncertainty range.
                  </p>
                </div>

                <div className="forecast-confidence">
                  <span className="confidence-indicator" />
                  {forecastData.confidence_level}% estimated interval · {forecastData.confidence} confidence
                </div>
              </div>

              <div className="forecast-chart-legend">
                <span>
                  <i className="legend-history" />
                  Historical
                </span>

                <span>
                  <i className="legend-predicted" />
                  Forecast
                </span>

                <span>
                  <i className="legend-confidence" />
                  Confidence band
                </span>
              </div>

              <div className="forecast-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{
                      top: 15,
                      right: 15,
                      left: 0,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid
                      stroke="#EAE5DB"
                      strokeDasharray="4 5"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="period"
                      tickFormatter={formatPeriod}
                      tick={{ fill: "#87919A", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={25}
                    />

                    <YAxis
                      tick={{ fill: "#87919A", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />

                    <Tooltip content={<ForecastTooltip />} />

                    <ReferenceLine
                      x={forecastData.latest_period}
                      stroke="#A9947A"
                      strokeDasharray="5 5"
                      label={{
                        value: "Forecast begins",
                        position: "insideTopRight",
                        fill: "#A9947A",
                        fontSize: 10,
                      }}
                    />

                    {/* Invisible lower base of confidence band */}
                    <Area
                      type="monotone"
                      dataKey="lower"
                      stackId="confidence"
                      stroke="none"
                      fill="#82968D"
                      fillOpacity={0}
                      connectNulls={false}
                      isAnimationActive={false}
                    />

                    {/* Shaded confidence interval */}
                    <Area
                      type="monotone"
                      dataKey="bandWidth"
                      stackId="confidence"
                      stroke="none"
                      fill="#82968D"
                      fillOpacity={0.20}
                      connectNulls={false}
                      isAnimationActive
                    />

                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Historical demand"
                      stroke={COLORS.slate}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: COLORS.slate,
                      }}
                      connectNulls={false}
                      isAnimationActive
                    />

                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted demand"
                      stroke={COLORS.sage}
                      strokeWidth={2.8}
                      strokeDasharray="6 4"
                      dot={{
                        r: 3,
                        fill: COLORS.sage,
                        strokeWidth: 0,
                      }}
                      activeDot={{
                        r: 6,
                        stroke: "#fff",
                        strokeWidth: 2,
                      }}
                      connectNulls={false}
                      isAnimationActive
                    />

                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="forecast-chart-footnote">
                Historical observations and forecasts use a common demand
                index. They do not represent actual visitor counts.
              </div>

            </section>

            {/* Seasonality and opportunity insights */}
            <div className="forecast-lower-grid">

              <section className="forecast-panel seasonality-panel">

                <div className="forecast-panel-heading">
                  <div>
                    <span className="forecast-section-label">
                      SEASONAL PATTERN
                    </span>

                    <h3>When demand rises and falls</h3>

                    <p>
                      Relative demand by calendar month, based on historical
                      patterns.
                    </p>
                  </div>
                </div>

                <div className="seasonality-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={seasonalityData}
                      margin={{
                        top: 15,
                        right: 5,
                        left: -20,
                        bottom: 0,
                      }}
                    >
                      <CartesianGrid
                        stroke="#EAE5DB"
                        strokeDasharray="4 5"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="month"
                        tick={{ fill: "#87919A", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        tick={{ fill: "#87919A", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <Tooltip
                        formatter={(value) => [
                          Number(value).toFixed(1),
                          "Relative demand",
                        ]}
                      />

                      <ReferenceLine
                        y={100}
                        stroke="#A9947A"
                        strokeDasharray="4 4"
                      />

                      <Bar
                        dataKey="demand"
                        fill={COLORS.slate}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={30}
                        isAnimationActive
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="seasonality-note">
                  <span className="seasonality-line" />
                  100 represents the overall historical monthly average.
                </div>

              </section>

              <section className="forecast-panel opportunity-panel">

                <span className="forecast-section-label">
                  OPPORTUNITY RADAR
                </span>

                <h3>Plan around demand</h3>

                <p className="opportunity-description">
                  Use the forecast to identify months that may need
                  additional attention.
                </p>

                <div className="opportunity-item">
                  <div className="opportunity-icon peak-icon">
                    <TrendingUp size={17} />
                  </div>

                  <div>
                    <span>Strongest upcoming month</span>
                    <strong>{formatPeriod(metrics.peak.period)}</strong>
                    <small>
                      Demand index: {formatNumber(metrics.peak.predicted)}
                    </small>
                  </div>
                </div>

                <div className="opportunity-item">
                  <div className="opportunity-icon low-icon">
                    <Waves size={17} />
                  </div>

                  <div>
                    <span>Quieter upcoming month</span>
                    <strong>{formatPeriod(metrics.lowest.period)}</strong>
                    <small>
                      Demand index: {formatNumber(metrics.lowest.predicted)}
                    </small>
                  </div>
                </div>

                <div className="opportunity-recommendation">
                  <strong>Planning consideration</strong>

                  <p>
                    Consider targeted promotions and flexible packages
                    during quieter periods, while reviewing supplier
                    capacity ahead of stronger demand.
                  </p>
                </div>

              </section>

            </div>

            {/* Data transparency */}
            <div className="forecast-data-disclaimer">
              <AlertCircle size={17} />

              <div>
                <strong>About these forecasts</strong>

                <p>
                  This dashboard uses synthetic calibrated historical
                  demand indices and a seasonal trend projection model.
                  The 80% interval is an approximate model-based
                  uncertainty range. These results are intended for
                  demonstration and planning, not as verified tourism
                  statistics or guaranteed outcomes.
                </p>
              </div>
            </div>

          </>
        )}

    </div>
  );
}
