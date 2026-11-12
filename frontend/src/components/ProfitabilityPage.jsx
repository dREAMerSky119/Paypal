
import { useState, useEffect, useMemo } from "react";
import { formatDisplayWhole, formatDisplayCompact } from "../lib/fx.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";

import {
  ArrowRight,
  CalendarDays,
  Wallet,
  TrendingUp,
  Percent,
  AlertTriangle,
  Coins,
  MousePointerClick,
  Layers3,
  Target,
  X,
  PieChart as PieIcon,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import {
  Button,
  PageHeader,
  MetricCard,
} from "./ui.jsx";

import {
  ResponsiveContainer,
  Treemap,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { api } from "../lib/api.js";

import "../profitability.css";

// One restrained palette is shared by every chart so the page feels cohesive.
const COLORS = [
  "#596D82", // slate indigo
  "#75879A", // muted blue
  "#657D7A", // deep teal
  "#82968D", // sage
  "#8C8983", // muted violet
  "#9BA4AC", // blue grey
  "#A9947A", // muted sand
  "#596D82", // steel blue
];

const GROUP_LABELS = {
  destination: "destinations",
  supplier: "suppliers",
  package: "packages",
  season: "seasons",
};

// Money is converted into the user's preferred display currency (see lib/fx.js).
// Components that call these also call useDisplayCurrency() so they re-render on change.
const formatMoney = (value, currency = "USD") => formatDisplayWhole(value, currency);
const formatShortMoney = (value) => formatDisplayCompact(value, "USD");

// ==========================================
// TREEMAP TILE
// ==========================================

function TreemapTile({
  x,
  y,
  width,
  height,
  name,
  gross_sales,
  gross_profit,
  gross_margin,
  view,
  selected,
  index,
  onSelect,
}) {
  useDisplayCurrency();
  if (width < 2 || height < 2) return null;

  const salesColors = [
    "#596D82", "#667A8F", "#75879A", "#8796A6",
    "#657D7A", "#718985", "#829994", "#91A59D",
    "#596D82", "#718397", "#8795A4", "#9BA4AC",
  ];

  const profitColors = [
    "#657D7A", "#718985", "#82968D", "#82968D",
    "#596D82", "#667A8F", "#75879A", "#8796A6",
    "#596D82", "#718397", "#8795A4", "#9BA4AC",
  ];

  const marginColors = [
    "#596D82", "#596D82", "#75879A", "#8796A6",
    "#657D7A", "#718985", "#82968D", "#91A59D",
    "#8C8983", "#96918A", "#A9947A", "#B5A58F",
  ];

  const colorIndex = [...String(name || "")].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0
  );

  const safeIndex = Number.isInteger(index) ? index : colorIndex;

  let fill;

  if (view === "profit") {
    fill = profitColors[safeIndex % profitColors.length];
  } else if (view === "margin") {
    fill = marginColors[safeIndex % marginColors.length];
  } else {
    fill = salesColors[safeIndex % salesColors.length];
  }

  const isSelected = selected === name;
  const isDimmed = selected && !isSelected;

  return (
    <g
      onClick={() => onSelect(name)}
      style={{
        cursor: "pointer",
        opacity: isDimmed ? 0.3 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <rect
        x={x + 3}
        y={y + 3}
        width={Math.max(0, width - 6)}
        height={Math.max(0, height - 6)}
        rx={9}
        fill={fill}
        stroke="none"
        style={{
          transition: "filter 0.2s ease",
          filter: isSelected ? "brightness(1.12)" : "none",
        }}
      />

      {width > 75 && height > 45 && (
        <>
          <text
            x={x + 13}
            y={y + 25}
            fill="#F8F5EF"
            fontSize={Math.min(13, Math.max(9, width / 12))}
            fontWeight="700"
            style={{ pointerEvents: "none" }}
          >
            {String(name || "").length > 19
              ? `${String(name).slice(0, 17)}…`
              : name}
          </text>

          <text
            x={x + 13}
            y={y + 44}
            fill="#F8F5EF"
            fontSize={11}
            fontWeight="600"
            style={{ pointerEvents: "none" }}
          >
            {view === "sales"
              ? formatShortMoney(gross_sales)
              : view === "profit"
                ? formatShortMoney(gross_profit)
                : `${Number(gross_margin).toFixed(1)}% margin`}
          </text>

          {height > 70 && (
            <text
              x={x + 13}
              y={y + 61}
              fill="#F8F5EF"
              fillOpacity={0.9}
              fontSize={10}
              style={{ pointerEvents: "none" }}
            >
              {view === "sales"
                ? `${Number(gross_margin).toFixed(1)}% margin`
                : `Sales ${formatShortMoney(gross_sales)}`}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ==========================================
// RADIAL GAUGE
// ==========================================

function RadialGauge({
  value,
  size = 110,
  stroke = 9,
  color = "#596D82",
  label,
  selected = false,
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const percentage = Math.max(
    0,
    Math.min(100, Number(value) || 0)
  );

  const progress = (percentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label || "Gross margin"}: ${Number(value).toFixed(2)} percent`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E4E1D9"
        strokeWidth={stroke}
      />

      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.7s ease" }}
      />

      <text
        x="50%"
        y="47%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#344454"
        fontSize={size > 130 ? 22 : 16}
        fontWeight="800"
      >
        {Number(value).toFixed(1)}%
      </text>

      {selected && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius + 5}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      )}
    </svg>
  );
}

// ==========================================
// MONTHLY TREND TOOLTIP
// ==========================================

function MonthlyTooltip({ active, payload, currency }) {
  useDisplayCurrency();
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;

  if (!item) return null;

  return (
    <div style={{
      background: "#344454",
      color: "#F1ECE2",
      padding: "14px 16px",
      borderRadius: "12px",
      boxShadow: "0 10px 28px rgba(52,68,84,0.14)",
      border: "1px solid #536475",
      minWidth: "190px",
    }}>
      <strong style={{ fontSize: "13px" }}>
        {item.label}
      </strong>

      <p style={{ color: "#657D7A", fontSize: "12px", margin: "10px 0 5px" }}>
        Gross profit: {formatMoney(item.gross_profit, currency)}
      </p>

      <p style={{ color: "#A9947A", fontSize: "12px", margin: "5px 0" }}>
        Gross margin: {Number(item.gross_margin).toFixed(2)}%
      </p>

      <p style={{ color: "#64717C", fontSize: "11px", margin: "5px 0" }}>
        Sales: {formatMoney(item.gross_sales, currency)}
      </p>

      <p style={{ color: "#64717C", fontSize: "11px", margin: "5px 0" }}>
        Cancellation leakage: {formatMoney(item.cancellation_leakage, currency)}
      </p>

      <p style={{ color: "#64717C", fontSize: "11px", margin: "5px 0 0" }}>
        Bookings: {item.completed_bookings} completed · {item.cancelled_bookings} cancelled
      </p>
    </div>
  );
}

// ==========================================
// REPORTING PERIOD DATE RANGE
// ==========================================

function getPeriodQuery(period) {
  if (period === "all") return "";

  const today = new Date();
  const to = new Date(today);
  const from = new Date(today);

  // Include today in the selected reporting period.
  from.setDate(from.getDate() - (Number(period) - 1));

  const formatDate = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return `?from=${formatDate(from)}&to=${formatDate(to)}`;
}

// ==========================================
// MAIN PROFITABILITY PAGE
// ==========================================

export default function ProfitabilityPage() {
  const fxDisplay = useDisplayCurrency();
  const [period, setPeriod] = useState("all");
  const [groupBy, setGroupBy] = useState("destination");

  const [summary, setSummary] = useState(null);
  const [breakdown, setBreakdown] = useState([]);

  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const [loading, setLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  const [error, setError] = useState("");
  const [breakdownError, setBreakdownError] = useState("");
  const [monthlyError, setMonthlyError] = useState("");

  const [treemapView, setTreemapView] = useState("sales");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedMarginItem, setSelectedMarginItem] = useState(null);
  const [selectedDonutItem, setSelectedDonutItem] = useState(null);

  // MARKUP SIMULATOR STATE

  const [markupPercentage, setMarkupPercentage] = useState(15);
  const [markupData, setMarkupData] = useState(null);
  const [markupLoading, setMarkupLoading] = useState(true);
  const [markupError, setMarkupError] = useState("");

  const currency = summary?.currency || "USD";

  // ==========================================
  // FETCH SUMMARY
  // ==========================================

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await api(
          `/analytics/profitability/summary${getPeriodQuery(period)}`
        );
        setSummary(data);
      } catch (err) {
        setError(
          err.detail ||
          err.message ||
          "Failed to load profitability data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [period]);

  // ==========================================
  // FETCH BREAKDOWN
  // ==========================================

  useEffect(() => {
    const fetchBreakdown = async () => {
      try {
        setBreakdownLoading(true);
        setBreakdownError("");

        setSelectedItem(null);
        setSelectedMarginItem(null);
        setSelectedDonutItem(null);

        const data = await api(
          `/analytics/profitability/breakdown?group_by=${groupBy}${getPeriodQuery(period).replace("?", "&")}`
        );

        setBreakdown(data.results || []);
      } catch (err) {
        setBreakdownError(
          err.detail ||
          err.message ||
          "Failed to load breakdown"
        );

        setBreakdown([]);
      } finally {
        setBreakdownLoading(false);
      }
    };

    fetchBreakdown();
  }, [groupBy, period]);

  // ==========================================
  // FETCH MONTHLY TREND
  // ==========================================

  useEffect(() => {
    const fetchMonthlyTrend = async () => {
      try {
        setMonthlyLoading(true);
        setMonthlyError("");

        const data = await api(
          `/analytics/profitability/monthly-trend${getPeriodQuery(period)}`
        );

        const results = data.results || [];

        setMonthlyTrend(results);

        if (results.length > 0) {
          setSelectedMonth(results[results.length - 1]);
        }
      } catch (err) {
        setMonthlyError(
          err.detail ||
          err.message ||
          "Failed to load monthly profitability"
        );

        setMonthlyTrend([]);
      } finally {
        setMonthlyLoading(false);
      }
    };

    fetchMonthlyTrend();
  }, [period]);

  // ==========================================
  // FETCH MARKUP WHAT-IF SIMULATION
  // ==========================================

  useEffect(() => {
    let isActive = true;

    const fetchMarkupSimulation = async () => {
      try {
        setMarkupLoading(true);
        setMarkupError("");

        const data = await api(
          `/analytics/profitability/markup-what-if?markup_percentage=${markupPercentage}${getPeriodQuery(period).replace("?", "&")}`
        );

        if (isActive) {
          setMarkupData(data);
        }
      } catch (err) {
        if (isActive) {
          setMarkupError(
            err.detail ||
            err.message ||
            "Failed to calculate markup simulation"
          );
        }
      } finally {
        if (isActive) {
          setMarkupLoading(false);
        }
      }
    };

    fetchMarkupSimulation();

    return () => {
      isActive = false;
    };
  }, [markupPercentage, period]);

  // ==========================================
  // SELECTED TREEMAP ITEM
  // ==========================================

  const selectedTreemapData = useMemo(
    () =>
      breakdown.find(
        (item) => item.name === selectedItem
      ) || null,
    [breakdown, selectedItem]
  );

  // ==========================================
  // WEIGHTED GROUP MARGIN
  // ==========================================

  const weightedMargin = useMemo(() => {
    const sales = breakdown.reduce(
      (sum, item) => sum + Number(item.gross_sales || 0),
      0
    );

    const profit = breakdown.reduce(
      (sum, item) => sum + Number(item.gross_profit || 0),
      0
    );

    return sales > 0 ? (profit / sales) * 100 : 0;
  }, [breakdown]);

  // ==========================================
  // TREEMAP DATA
  // ==========================================

  const treemapData = useMemo(() => {
    return [...breakdown]
      .filter((item) => Number(item.gross_sales) > 0)
      .map((item) => ({
        ...item,
        gross_sales: Number(item.gross_sales) || 0,
        gross_profit: Number(item.gross_profit) || 0,
        gross_margin: Number(item.gross_margin) || 0,
      }));
  }, [breakdown]);

  // ==========================================
  // MARGIN DATA
  // ==========================================

  const marginData = useMemo(() => {
    return [...breakdown].sort(
      (a, b) =>
        Number(b.gross_margin) - Number(a.gross_margin)
    );
  }, [breakdown]);

  const bestMargin = marginData[0] || null;

  const weakestMargin = marginData.length
    ? marginData[marginData.length - 1]
    : null;

  // ==========================================
  // DONUT DATA
  // ==========================================

  const donutData = useMemo(() => {
    return [...breakdown]
      .filter((item) => Number(item.gross_profit) > 0)
      .sort(
        (a, b) =>
          Number(b.gross_profit) - Number(a.gross_profit)
      )
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
      }));
  }, [breakdown]);

  const totalGroupProfit = donutData.reduce(
    (sum, item) =>
      sum + Number(item.gross_profit || 0),
    0
  );

  const groupLabel = GROUP_LABELS[groupBy];

  // ==========================================
  // MARKUP SIMULATOR DERIVED VALUES
  // ==========================================

  const profitDifference = Number(
    markupData?.profit_difference || 0
  );

  const isProfitImproved = profitDifference >= 0;

  const markupChange = Number(
    markupData?.proposed_markup || 0
  ) - Number(markupData?.current_markup || 0);

  // ==========================================
  // SELECTION HANDLERS
  // ==========================================

  const handleTreemapClick = (name) => {
    setSelectedItem((current) =>
      current === name ? null : name
    );
  };

  const handleMarginClick = (item) => {
    setSelectedMarginItem((current) =>
      current?.name === item.name ? null : item
    );
  };

  // ==========================================
  // DONUT TOOLTIP
  // ==========================================

  const DonutTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const item = payload[0].payload;

    return (
      <div style={{
        background: "#344454",
        color: "#F8F5EF",
        padding: "14px 17px",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(52,68,84,0.14)",
      }}>
        <strong>{item.name}</strong>

        <p style={{ color: "#A5B2A7", fontSize: "12px" }}>
          Profit: {formatMoney(item.gross_profit, currency)}
        </p>

        <p style={{ color: "#B5A58F", fontSize: "12px" }}>
          Margin: {Number(item.gross_margin).toFixed(2)}%
        </p>
      </div>
    );
  };

  const panelStyle = {
    background: "#F5F1E8",
    border: "1px solid #D9D2C6",
    borderRadius: "18px",
    padding: "25px",
    boxShadow: "0 6px 22px rgba(52,68,84,0.055)",
  };

  const smallLabel = {
    fontSize: "11px",
    fontWeight: 750,
    color: "#89939B",
    letterSpacing: "0.8px",
    textTransform: "uppercase",
  };

  return (
    <div className="profitability-page">

      {/* PAGE HEADER */}

        <PageHeader
          eyebrow="KNOW YOUR NUMBERS"
          title={
            <>
              Profitability analysis
              <span className="title-period">.</span>
            </>
          }
          description={`Understand the shape and performance of your travel business. Amounts shown in ${fxDisplay.currency}${fxDisplay.currency !== currency ? ` (${fxDisplay.rateLabel})` : ""}.`}
          action={
            <Button to="/app" variant="outline">
              <ArrowRight size={15} />
              Back to overview
            </Button>
          }
        />

      <p className="sample-note" role="note"><span /> Sample data · bookings shown are illustrative seed data</p>

      {/* FILTERS */}

      <div className="profitability-filters">
        <div className="filter-group">
          <label htmlFor="period-filter">
            <CalendarDays size={14} />
            Reporting period
          </label>

          <select
            id="period-filter"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="all">All available data</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="group-filter">Breakdown by</label>

          <select
            id="group-filter"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <option value="destination">Destination</option>
            <option value="supplier">Supplier</option>
            <option value="package">Package</option>
            <option value="season">Season</option>
          </select>
        </div>
      </div>

      {loading && <p>Loading profitability data...</p>}

      {error && (
        <p className="error-message">{error}</p>
      )}

      {/* KPI CARDS */}

      <div className="metrics-grid profitability-metrics">
        <MetricCard
          label="Gross Sales"
          value={
            summary
              ? formatMoney(summary.gross_sales, currency)
              : "—"
          }
          detail={
            summary
              ? `${summary.total_bookings} total bookings`
              : "Awaiting data"
          }
          icon={Wallet}
        />

        <MetricCard
          label="Net Cost"
          value={
            summary
              ? formatMoney(summary.total_net_cost, currency)
              : "—"
          }
          detail="Cost of completed bookings"
          icon={Coins}
        />

        <MetricCard
          label="Gross Profit"
          value={
            summary
              ? formatMoney(summary.gross_profit, currency)
              : "—"
          }
          detail={
            summary
              ? `${summary.completed_bookings} completed bookings`
              : "Awaiting data"
          }
          icon={TrendingUp}
        />

        <MetricCard
          label="Gross Margin"
          value={
            summary
              ? `${Number(summary.gross_margin).toFixed(2)}%`
              : "—"
          }
          detail="Profit as a percentage of sales"
          icon={Percent}
        />

        <MetricCard
          label="Cancellation Leakage"
          value={
            summary
              ? formatMoney(summary.cancellation_leakage, currency)
              : "—"
          }
          detail={
            summary
              ? `${summary.cancelled_bookings} cancelled bookings`
              : "Awaiting data"
          }
          icon={AlertTriangle}
        />
      </div>

      {/* =====================================
          PERFORMANCE OVERVIEW - TREEMAP
      ====================================== */}

      <section style={{ marginTop: "38px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}>
            <div style={{
              width: "35px",
              height: "35px",
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              color: "#596D82",
              background: "#E7E3DA",
            }}>
              <Layers3 size={18} />
            </div>

            <span style={smallLabel}>BUSINESS PERFORMANCE</span>
          </div>

          <h2 style={{ fontSize: "23px", margin: 0, fontWeight: 800 }}>
            Performance Overview
          </h2>

          <p style={{
            color: "#89939B",
            fontSize: "13px",
            marginTop: "7px",
          }}>
            Explore how sales and profit are distributed across your {groupLabel}.
          </p>
        </div>

        <div style={panelStyle}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "18px",
          }}>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              {[
                ["sales", "Sales"],
                ["profit", "Profit"],
                ["margin", "Margin"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTreemapView(value)}
                  aria-pressed={treemapView === value}
                  style={{
                    border: "1px solid",
                    borderColor: treemapView === value ? "#596D82" : "#D9DDE0",
                    background: treemapView === value ? "#E7E3DA" : "#F1ECE2",
                    color: treemapView === value ? "#596D82" : "#64717C",
                    borderRadius: "9px",
                    padding: "9px 15px",
                    fontSize: "12px",
                    fontWeight: 750,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <span style={{ fontSize: "11px", color: "#89939B" }}>
              Tile size represents gross sales
            </span>
          </div>

          {breakdownLoading ? (
            <p>Loading performance data...</p>
          ) : breakdownError ? (
            <p className="error-message">{breakdownError}</p>
          ) : treemapData.length === 0 ? (
            <p>No performance data available.</p>
          ) : (
            <div style={{ width: "100%", height: "440px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="gross_sales"
                  nameKey="name"
                  aspectRatio={4 / 3}
                  stroke="none"
                  content={
                    <TreemapTile
                      view={treemapView}
                      selected={selectedItem}
                      onSelect={handleTreemapClick}
                    />
                  }
                >
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;

                      const item = payload[0]?.payload;

                      return (
                        <div style={{
                          background: "#344454",
                          color: "#F8F5EF",
                          padding: "14px 17px",
                          borderRadius: "12px",
                          boxShadow: "0 10px 30px rgba(52,68,84,0.14)",
                        }}>
                          <strong>{item?.name}</strong>

                          <p style={{ color: "#C1C9D0", fontSize: "12px" }}>
                            Sales: {formatMoney(item?.gross_sales, currency)}
                          </p>

                          <p style={{ color: "#A5B2A7", fontSize: "12px" }}>
                            Profit: {formatMoney(item?.gross_profit, currency)}
                          </p>

                          <p style={{ color: "#B5A58F", fontSize: "12px" }}>
                            Margin: {Number(item?.gross_margin).toFixed(2)}%
                          </p>
                        </div>
                      );
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}

          {selectedTreemapData && (
            <div style={{
              marginTop: "20px",
              padding: "20px",
              borderRadius: "14px",
              background: "linear-gradient(120deg, #E7E3DA, #E7E9E2)",
              border: "1px solid #D9DDE0",
              position: "relative",
            }}>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Clear selection"
                style={{
                  position: "absolute",
                  right: "13px",
                  top: "13px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#64717C",
                }}
              >
                <X size={17} />
              </button>

              <p style={{
                ...smallLabel,
                color: "#596D82",
                margin: "0 0 5px",
              }}>
                SELECTED {groupBy.toUpperCase()}
              </p>

              <h3 style={{ fontSize: "17px", margin: "0 0 16px" }}>
                {selectedTreemapData.name}
              </h3>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "15px",
              }}>
                {[
                  ["Gross Sales", formatMoney(selectedTreemapData.gross_sales, currency), "#596D82"],
                  ["Net Cost", formatMoney(selectedTreemapData.total_net_cost, currency), "#64717C"],
                  ["Gross Profit", formatMoney(selectedTreemapData.gross_profit, currency), "#657D7A"],
                  ["Gross Margin", `${Number(selectedTreemapData.gross_margin).toFixed(2)}%`, "#75879A"],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <p style={{ fontSize: "11px", color: "#89939B", margin: "0 0 5px" }}>
                      {label}
                    </p>
                    <strong style={{ fontSize: "15px", color }}>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "#92999F",
            margin: "17px 0 0",
          }}>
            <MousePointerClick size={13} />
            Hover over tiles for details. Click a tile to inspect its financial performance.
          </p>
        </div>
      </section>

      {/* =====================================
          GROSS MARGIN - RADIAL GAUGES
      ====================================== */}

      <section style={{ marginTop: "42px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}>
            <div style={{
              width: "35px",
              height: "35px",
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              color: "#596D82",
              background: "#EAE5DB",
            }}>
              <Target size={18} />
            </div>

            <span style={smallLabel}>MARGIN PERFORMANCE</span>
          </div>

          <h2 style={{ fontSize: "23px", margin: 0, fontWeight: 800 }}>
            Gross Margin Analysis
          </h2>

          <p style={{ color: "#89939B", fontSize: "13px", marginTop: "7px" }}>
            See how efficiently your {groupLabel} convert revenue into profit.
          </p>
        </div>

        <div style={panelStyle}>
          {breakdownLoading ? (
            <p>Loading margin analysis...</p>
          ) : breakdownError ? (
            <p className="error-message">{breakdownError}</p>
          ) : marginData.length === 0 ? (
            <p>No margin data available.</p>
          ) : (
            <>
              <div
                className="profitability-margin-overview"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(210px, 0.8fr) minmax(220px, 1.2fr)",
                  gap: "25px",
                  alignItems: "center",
                  padding: "18px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #EAE5DB, #EAE5DB)",
                  marginBottom: "28px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <p style={{
                    ...smallLabel,
                    color: "#596D82",
                    margin: "0 0 14px",
                  }}>
                    WEIGHTED GROSS MARGIN
                  </p>

                  <RadialGauge
                    value={summary ? summary.gross_margin : weightedMargin}
                    size={190}
                    stroke={13}
                    color="#596D82"
                  />

                  <p style={{
                    fontSize: "11px",
                    color: "#596D82",
                    fontWeight: 650,
                    margin: "8px 0 0",
                  }}>
                    Overall business performance
                  </p>
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "17px",
                }}>
                  <div>
                    <p style={{ ...smallLabel, color: "#596D82", margin: "0 0 6px" }}>
                      HIGHEST MARGIN
                    </p>

                    <strong style={{ fontSize: "20px", color: "#596D82" }}>
                      {bestMargin?.name || "—"}
                    </strong>

                    <p style={{ fontSize: "13px", color: "#64717C", margin: "4px 0 0" }}>
                      {bestMargin
                        ? `${Number(bestMargin.gross_margin).toFixed(2)}% gross margin`
                        : "No data"}
                    </p>
                  </div>

                  <div style={{ height: "1px", background: "#D9DDE0" }} />

                  <div>
                    <p style={{ ...smallLabel, color: "#A9947A", margin: "0 0 6px" }}>
                      LOWEST MARGIN
                    </p>

                    <strong style={{ fontSize: "20px", color: "#9B8468" }}>
                      {weakestMargin?.name || "—"}
                    </strong>

                    <p style={{ fontSize: "13px", color: "#64717C", margin: "4px 0 0" }}>
                      {weakestMargin
                        ? `${Number(weakestMargin.gross_margin).toFixed(2)}% gross margin`
                        : "No data"}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{
                display: "flex",
                alignItems: "stretch",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: "15px",
              }}>
                {marginData.map((item, index) => {
                  const isSelected = selectedMarginItem?.name === item.name;
                  const isBest = item.name === bestMargin?.name;
                  const isWeakest = item.name === weakestMargin?.name;

                  const gaugeColor = isBest
                    ? "#657D7A"
                    : isWeakest
                      ? "#A9947A"
                      : "#596D82";

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleMarginClick(item)}
                      aria-pressed={isSelected}
                      style={{
                        width: "155px",
                        minHeight: "195px",
                        padding: "16px 10px",
                        borderRadius: "15px",
                        border: isSelected ? `2px solid ${gaugeColor}` : "1px solid #E2DDD3",
                        background: isSelected ? "#E7E3DA" : "#F1ECE2",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "9px",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: isSelected ? "0 6px 18px rgba(139,92,246,0.12)" : "none",
                      }}
                    >
                      <span style={{
                        ...smallLabel,
                        color: isBest ? "#657D7A" : isWeakest ? "#A9947A" : "#89939B",
                      }}>
                        {isBest ? "TOP PERFORMER" : isWeakest ? "NEEDS REVIEW" : `RANK #${index + 1}`}
                      </span>

                      <RadialGauge
                        value={item.gross_margin}
                        size={100}
                        stroke={8}
                        color={gaugeColor}
                        selected={isSelected}
                      />

                      <strong style={{
                        fontSize: "12px",
                        color: "#465563",
                        textAlign: "center",
                        overflowWrap: "anywhere",
                      }}>
                        {item.name}
                      </strong>

                      <span style={{ fontSize: "10px", color: "#89939B" }}>
                        {formatShortMoney(item.gross_profit)} profit
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedMarginItem && (
                <div style={{
                  marginTop: "23px",
                  padding: "20px",
                  borderRadius: "14px",
                  background: "linear-gradient(120deg, #EAE5DB, #EAE5DB)",
                  border: "1px solid #D9D3C8",
                  position: "relative",
                }}>
                  <button
                    type="button"
                    onClick={() => setSelectedMarginItem(null)}
                    aria-label="Clear margin selection"
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      border: "none",
                      background: "transparent",
                      color: "#64717C",
                      cursor: "pointer",
                    }}
                  >
                    <X size={17} />
                  </button>

                  <p style={{ ...smallLabel, color: "#596D82", margin: "0 0 5px" }}>
                    SELECTED {groupBy.toUpperCase()}
                  </p>

                  <h3 style={{ fontSize: "17px", margin: "0 0 16px" }}>
                    {selectedMarginItem.name}
                  </h3>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "15px",
                  }}>
                    {[
                      ["Gross Margin", `${Number(selectedMarginItem.gross_margin).toFixed(2)}%`, "#75879A"],
                      ["Gross Profit", formatMoney(selectedMarginItem.gross_profit, currency), "#657D7A"],
                      ["Gross Sales", formatMoney(selectedMarginItem.gross_sales, currency), "#596D82"],
                      ["Net Cost", formatMoney(selectedMarginItem.total_net_cost, currency), "#64717C"],
                    ].map(([label, value, color]) => (
                      <div key={label}>
                        <p style={{ fontSize: "11px", color: "#89939B", margin: "0 0 5px" }}>
                          {label}
                        </p>
                        <strong style={{ fontSize: "15px", color }}>
                          {value}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <p style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "#92999F",
            margin: "20px 0 0",
          }}>
            <MousePointerClick size={13} />
            Select any radial gauge to inspect its financial details.
          </p>
        </div>
      </section>

      {/* =====================================
          PROFIT CONTRIBUTION - DONUT
      ====================================== */}

      <section style={{ marginTop: "42px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}>
            <div style={{
              width: "35px",
              height: "35px",
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              color: "#657D7A",
              background: "#E7E9E2",
            }}>
              <PieIcon size={18} />
            </div>

            <span style={smallLabel}>PROFIT DISTRIBUTION</span>
          </div>

          <h2 style={{ fontSize: "23px", margin: 0, fontWeight: 800 }}>
            Profit Contribution
          </h2>

          <p style={{ color: "#89939B", fontSize: "13px", marginTop: "7px" }}>
            Understand how each group contributes to total gross profit.
          </p>
        </div>

        <div style={panelStyle}>
          {breakdownLoading ? (
            <p>Loading profit contribution...</p>
          ) : breakdownError ? (
            <p className="error-message">{breakdownError}</p>
          ) : donutData.length === 0 ? (
            <p>No profit contribution data available.</p>
          ) : (
            <div
              className="profitability-donut-layout"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(230px, 1fr) minmax(220px, 1fr)",
                gap: "25px",
                alignItems: "center",
              }}
            >
              <div style={{ height: "340px", position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="gross_profit"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="61%"
                      outerRadius="86%"
                      paddingAngle={3}
                      cornerRadius={5}
                      stroke="none"
                      animationDuration={1000}
                      onClick={(item) => {
                        setSelectedDonutItem((current) =>
                          current?.name === item.name ? null : item
                        );
                      }}
                      cursor="pointer"
                    >
                      {donutData.map((item) => (
                        <Cell
                          key={item.name}
                          fill={item.color}
                          opacity={
                            selectedDonutItem && selectedDonutItem.name !== item.name
                              ? 0.3
                              : 1
                          }
                          stroke={selectedDonutItem?.name === item.name ? "#344454" : "none"}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>

                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  pointerEvents: "none",
                  textAlign: "center",
                }}>
                  <span style={{ fontSize: "11px", color: "#89939B" }}>
                    {selectedDonutItem ? "SELECTED PROFIT" : "TOTAL GROUP PROFIT"}
                  </span>

                  <strong style={{
                    fontSize: "clamp(17px, 2vw, 24px)",
                    marginTop: "7px",
                    color: "#344454",
                  }}>
                    {formatMoney(
                      selectedDonutItem ? selectedDonutItem.gross_profit : totalGroupProfit,
                      currency
                    )}
                  </strong>

                  {selectedDonutItem && (
                    <span style={{ fontSize: "11px", color: "#596D82", marginTop: "5px" }}>
                      {selectedDonutItem.name}
                    </span>
                  )}
                </div>
              </div>

              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "7px",
                maxHeight: "340px",
                overflowY: "auto",
              }}>
                <p style={{ ...smallLabel, margin: "0 0 8px" }}>
                  PROFIT BY {groupBy.toUpperCase()}
                </p>

                {donutData.map((item) => {
                  const contribution = totalGroupProfit > 0
                    ? (Number(item.gross_profit) / totalGroupProfit) * 100
                    : 0;

                  const active = selectedDonutItem?.name === item.name;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setSelectedDonutItem(active ? null : item)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        width: "100%",
                        padding: "11px",
                        borderRadius: "10px",
                        border: active ? "1px solid #8796A6" : "1px solid transparent",
                        background: active ? "#EAE5DB" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        minWidth: 0,
                      }}>
                        <span style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "3px",
                          flexShrink: 0,
                          background: item.color,
                        }} />

                        <span style={{
                          fontSize: "12px",
                          color: "#53616D",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {item.name}
                        </span>
                      </span>

                      <strong style={{
                        fontSize: "12px",
                        color: active ? "#596D82" : "#64717C",
                      }}>
                        {contribution.toFixed(1)}%
                      </strong>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDonutItem && (
            <div style={{
              marginTop: "15px",
              padding: "17px",
              borderRadius: "12px",
              background: "#EAE5DB",
              border: "1px solid #D9D3C8",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "15px",
            }}>
              <div>
                <p style={{ ...smallLabel, color: "#596D82", margin: "0 0 5px" }}>
                  SELECTED {groupBy.toUpperCase()}
                </p>
                <strong>{selectedDonutItem.name}</strong>
              </div>

              <div>
                <p style={{ fontSize: "11px", color: "#89939B", margin: 0 }}>
                  Gross Profit
                </p>
                <strong>{formatMoney(selectedDonutItem.gross_profit, currency)}</strong>
              </div>

              <div>
                <p style={{ fontSize: "11px", color: "#89939B", margin: 0 }}>
                  Gross Margin
                </p>
                <strong style={{ color: "#596D82" }}>
                  {Number(selectedDonutItem.gross_margin).toFixed(2)}%
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDonutItem(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#64717C",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Clear selection ×
              </button>
            </div>
          )}
        </div>
      </section>

      {/* =====================================
          MARKUP WHAT-IF SIMULATOR
      ====================================== */}

      <section style={{ marginTop: "42px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}>
            <div style={{
              width: "35px",
              height: "35px",
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              color: "#657D7A",
              background: "#E7E9E2",
            }}>
              <SlidersHorizontal size={18} />
            </div>

            <span style={smallLabel}>PRICING INTELLIGENCE</span>
          </div>

          <h2 style={{ fontSize: "23px", margin: 0, fontWeight: 800 }}>
            Markup What-if Simulator
          </h2>

          <p style={{ color: "#89939B", fontSize: "13px", marginTop: "7px" }}>
            Experiment with different markup strategies and see their impact on your profitability.
          </p>
        </div>

        <div style={{
          ...panelStyle,
          padding: "26px",
          overflow: "hidden",
        }}>
          {markupLoading && !markupData ? (
            <p>Calculating pricing projections...</p>
          ) : markupError && !markupData ? (
            <p className="error-message">{markupError}</p>
          ) : markupData ? (
            <>
              {/* MARKUP CONTROL */}

              <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(180px, 0.6fr)",
                gap: "25px",
                alignItems: "center",
                padding: "22px",
                borderRadius: "16px",
                background: "linear-gradient(120deg, #E7E9E2, #E7E9E2, #EAE5DB)",
                border: "1px solid #E7E9E2",
              }}>
                <div>
                  <p style={{
                    ...smallLabel,
                    color: "#657D7A",
                    margin: "0 0 13px",
                  }}>
                    ADJUST YOUR PROPOSED MARKUP
                  </p>

                  <div style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "6px",
                    marginBottom: "12px",
                  }}>
                    <strong style={{
                      fontSize: "42px",
                      color: "#657D7A",
                      letterSpacing: "-2px",
                    }}>
                      {markupPercentage}
                    </strong>

                    <span style={{
                      fontSize: "23px",
                      color: "#657D7A",
                      fontWeight: 700,
                    }}>
                      %
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={markupPercentage}
                    onChange={(e) => setMarkupPercentage(Number(e.target.value))}
                    aria-label="Proposed markup percentage"
                    style={{
                      width: "100%",
                      accentColor: "#657D7A",
                      cursor: "pointer",
                    }}
                  />

                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#89939B",
                    fontSize: "11px",
                    marginTop: "7px",
                  }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>

                  <div style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "17px",
                  }}>
                    {[5, 10, 15, 20, 25, 30].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMarkupPercentage(value)}
                        aria-pressed={markupPercentage === value}
                        style={{
                          padding: "7px 13px",
                          borderRadius: "8px",
                          border: markupPercentage === value
                            ? "1px solid #657D7A"
                            : "1px solid #C9C8C1",
                          background: markupPercentage === value
                            ? "#E7E9E2"
                            : "#F8F5EF",
                          color: markupPercentage === value
                            ? "#657D7A"
                            : "#64717C",
                          fontSize: "11px",
                          fontWeight: 750,
                          cursor: "pointer",
                        }}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  padding: "20px",
                  background: "#F1ECE2",
                  border: "1px solid #E7E9E2",
                  borderRadius: "14px",
                  textAlign: "center",
                }}>
                  <p style={{
                    ...smallLabel,
                    color: "#64717C",
                    margin: "0 0 10px",
                  }}>
                    CURRENT MARKUP
                  </p>

                  <strong style={{
                    fontSize: "32px",
                    color: "#465563",
                  }}>
                    {Number(markupData.current_markup).toFixed(2)}%
                  </strong>

                  <p style={{
                    fontSize: "11px",
                    color: "#89939B",
                    margin: "8px 0 0",
                  }}>
                    Based on existing booking prices
                  </p>
                </div>
              </div>

              {/* PROFIT IMPACT */}

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "13px",
                marginTop: "20px",
              }}>
                <div style={{
                  padding: "19px",
                  borderRadius: "13px",
                  background: "#E7E9E2",
                  border: "1px solid #DCE5DD",
                }}>
                  <p style={{ ...smallLabel, color: "#657D7A", margin: "0 0 10px" }}>
                    PROJECTED PROFIT
                  </p>

                  <strong style={{ fontSize: "23px", color: "#657D7A" }}>
                    {formatMoney(markupData.projected_gross_profit, currency)}
                  </strong>

                  <p style={{ fontSize: "11px", color: "#64717C", margin: "8px 0 0" }}>
                    At {markupPercentage}% proposed markup
                  </p>
                </div>

                <div style={{
                  padding: "19px",
                  borderRadius: "13px",
                  background: isProfitImproved ? "#EAE5DB" : "#F0E9DC",
                  border: `1px solid ${isProfitImproved ? "#D9DDE0" : "#D9CDBB"}`,
                }}>
                  <p style={{
                    ...smallLabel,
                    color: isProfitImproved ? "#596D82" : "#9B8468",
                    margin: "0 0 10px",
                  }}>
                    PROFIT IMPACT
                  </p>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                  }}>
                    {isProfitImproved
                      ? <ArrowUpRight size={22} color="#596D82" />
                      : <ArrowDownRight size={22} color="#9B8468" />}

                    <strong style={{
                      fontSize: "23px",
                      color: isProfitImproved ? "#465A6D" : "#9B8468",
                    }}>
                      {profitDifference >= 0 ? "+" : ""}
                      {formatMoney(profitDifference, currency)}
                    </strong>
                  </div>

                  <p style={{ fontSize: "11px", color: "#64717C", margin: "8px 0 0" }}>
                    Compared with current gross profit
                  </p>
                </div>

                <div style={{
                  padding: "19px",
                  borderRadius: "13px",
                  background: "#EAE5DB",
                  border: "1px solid #D9D3C8",
                }}>
                  <p style={{ ...smallLabel, color: "#596D82", margin: "0 0 10px" }}>
                    PROJECTED MARGIN
                  </p>

                  <strong style={{ fontSize: "23px", color: "#596D82" }}>
                    {Number(markupData.projected_gross_margin).toFixed(2)}%
                  </strong>

                  <p style={{ fontSize: "11px", color: "#64717C", margin: "8px 0 0" }}>
                    Current: {Number(markupData.current_gross_margin).toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* CURRENT VS PROJECTED COMPARISON */}

              <div style={{
                marginTop: "24px",
                padding: "21px",
                borderRadius: "15px",
                border: "1px solid #E2DDD3",
                background: "#F5F1E8",
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginBottom: "19px",
                }}>
                  <div>
                    <p style={{ ...smallLabel, margin: "0 0 5px" }}>
                      FINANCIAL COMPARISON
                    </p>

                    <h3 style={{
                      fontSize: "16px",
                      margin: 0,
                      color: "#344454",
                    }}>
                      Current vs projected performance
                    </h3>
                  </div>

                  <span style={{
                    fontSize: "11px",
                    color: "#64717C",
                    background: "#F1ECE2",
                    border: "1px solid #D9DDE0",
                    padding: "7px 10px",
                    borderRadius: "8px",
                  }}>
                    {markupChange >= 0 ? "+" : ""}
                    {markupChange.toFixed(2)} percentage points in markup
                  </span>
                </div>

                {[
                  {
                    label: "Gross Sales",
                    current: markupData.current_gross_sales,
                    projected: markupData.projected_gross_sales,
                    color: "#657D7A",
                  },
                  {
                    label: "Gross Profit",
                    current: markupData.current_gross_profit,
                    projected: markupData.projected_gross_profit,
                    color: "#657D7A",
                  },
                ].map((item) => {
                  const maxValue = Math.max(
                    Math.abs(Number(item.current)),
                    Math.abs(Number(item.projected)),
                    1
                  );

                  return (
                    <div key={item.label} style={{ marginBottom: "22px" }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "10px",
                      }}>
                        <strong style={{ fontSize: "12px", color: "#53616D" }}>
                          {item.label}
                        </strong>

                        <span style={{ fontSize: "11px", color: "#89939B" }}>
                          Current / Projected
                        </span>
                      </div>

                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "12px",
                        alignItems: "center",
                        marginBottom: "9px",
                      }}>
                        <div style={{
                          height: "13px",
                          background: "#D9DDE0",
                          borderRadius: "20px",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.max(0, Math.abs(Number(item.current)) / maxValue * 100)}%`,
                            background: "#89939B",
                            borderRadius: "20px",
                            transition: "width 0.5s ease",
                          }} />
                        </div>

                        <strong style={{
                          fontSize: "12px",
                          color: "#64717C",
                          minWidth: "95px",
                          textAlign: "right",
                        }}>
                          {formatMoney(item.current, currency)}
                        </strong>
                      </div>

                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "12px",
                        alignItems: "center",
                      }}>
                        <div style={{
                          height: "13px",
                          background: "#D9DDE0",
                          borderRadius: "20px",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.max(0, Math.abs(Number(item.projected)) / maxValue * 100)}%`,
                            background: item.color,
                            borderRadius: "20px",
                            transition: "width 0.5s ease",
                          }} />
                        </div>

                        <strong style={{
                          fontSize: "12px",
                          color: item.color,
                          minWidth: "95px",
                          textAlign: "right",
                        }}>
                          {formatMoney(item.projected, currency)}
                        </strong>
                      </div>
                    </div>
                  );
                })}

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginTop: "10px",
                  paddingTop: "17px",
                  borderTop: "1px solid #E2DDD3",
                }}>
                  <div>
                    <p style={{ fontSize: "10px", color: "#89939B", margin: "0 0 5px" }}>
                      CURRENT GROSS MARGIN
                    </p>

                    <strong style={{ fontSize: "18px", color: "#64717C" }}>
                      {Number(markupData.current_gross_margin).toFixed(2)}%
                    </strong>
                  </div>

                  <div>
                    <p style={{ fontSize: "10px", color: "#89939B", margin: "0 0 5px" }}>
                      PROJECTED GROSS MARGIN
                    </p>

                    <strong style={{ fontSize: "18px", color: "#596D82" }}>
                      {Number(markupData.projected_gross_margin).toFixed(2)}%
                    </strong>
                  </div>

                  <div>
                    <p style={{ fontSize: "10px", color: "#89939B", margin: "0 0 5px" }}>
                      COMPLETED BOOKINGS
                    </p>

                    <strong style={{ fontSize: "18px", color: "#465563" }}>
                      {markupData.completed_bookings}
                    </strong>
                  </div>

                  <div>
                    <p style={{ fontSize: "10px", color: "#89939B", margin: "0 0 5px" }}>
                      CANCELLATION LEAKAGE
                    </p>

                    <strong style={{ fontSize: "18px", color: "#9B8468" }}>
                      {formatMoney(markupData.cancellation_leakage, currency)}
                    </strong>
                  </div>
                </div>
              </div>

              {markupError && (
                <p className="error-message" style={{ marginTop: "12px" }}>
                  {markupError}
                </p>
              )}

              {markupLoading && (
                <p style={{
                  fontSize: "11px",
                  color: "#89939B",
                  marginTop: "12px",
                }}>
                  Updating projection...
                </p>
              )}

              <p style={{
                fontSize: "11px",
                color: "#89939B",
                lineHeight: 1.6,
                margin: "17px 0 0",
              }}>
                <strong>Simulation assumption:</strong> The proposed markup is applied to completed booking supplier costs. Supplier costs, fees and cancellation leakage remain unchanged. This is a scenario estimate, not a forecast of customer demand.
              </p>
            </>
          ) : (
            <p>No simulation data available.</p>
          )}
        </div>
      </section>

      {/* =====================================
          MONTHLY PROFITABILITY TIMELINE
      ====================================== */}

      <section style={{ marginTop: "42px" }}>
        <div style={{ marginBottom: "18px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}>
            <div style={{
              width: "35px",
              height: "35px",
              display: "grid",
              placeItems: "center",
              borderRadius: "10px",
              color: "#657D7A",
              background: "#E7E9E2",
            }}>
              <TrendingUp size={18} />
            </div>

            <span style={smallLabel}>FINANCIAL TIMELINE</span>
          </div>

          <h2 style={{
            fontSize: "23px",
            margin: 0,
            fontWeight: 800,
            color: "#344454",
          }}>
            Monthly Profitability Trend
          </h2>

          <p style={{
            color: "#89939B",
            fontSize: "13px",
            marginTop: "7px",
          }}>
            Track how profit and margin move across your business over time.
          </p>
        </div>

        {monthlyLoading ? (
          <div style={panelStyle}>Loading monthly performance...</div>
        ) : monthlyError ? (
          <p className="error-message">{monthlyError}</p>
        ) : monthlyTrend.length === 0 ? (
          <div style={panelStyle}>No monthly data available.</div>
        ) : (
          <div style={{
            background: "#F1ECE2",
            border: "1px solid #E2DDD3",
            borderRadius: "18px",
            padding: "22px",
            boxShadow: "0 8px 28px rgba(30,41,59,0.045)",
          }}>
            {/* SUMMARY */}

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "15px",
              marginBottom: "20px",
            }}>
              <div>
                <p style={{
                  fontSize: "11px",
                  color: "#89939B",
                  fontWeight: 750,
                  letterSpacing: "0.8px",
                  margin: "0 0 7px",
                }}>
                  SELECTED MONTH · GROSS PROFIT
                </p>

                <strong style={{
                  fontSize: "30px",
                  color: "#344454",
                  letterSpacing: "-1px",
                }}>
                  {formatMoney(selectedMonth?.gross_profit ?? 0, currency)}
                </strong>

                <p style={{
                  fontSize: "12px",
                  color: "#89939B",
                  margin: "5px 0 0",
                }}>
                  {selectedMonth?.label || "Select a month"}
                </p>
              </div>

              <div style={{
                background: "#F0E9DC",
                border: "1px solid #DDD2BE",
                borderRadius: "12px",
                padding: "12px 18px",
                minWidth: "125px",
              }}>
                <p style={{
                  fontSize: "10px",
                  color: "#8F795D",
                  fontWeight: 700,
                  margin: "0 0 5px",
                  letterSpacing: "0.6px",
                }}>
                  GROSS MARGIN
                </p>

                <strong style={{
                  fontSize: "24px",
                  color: "#A9947A",
                }}>
                  {Number(selectedMonth?.gross_margin || 0).toFixed(2)}%
                </strong>
              </div>
            </div>

            {/* LEGEND */}

            <div style={{
              display: "flex",
              gap: "22px",
              flexWrap: "wrap",
              marginBottom: "8px",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#64717C",
              }}>
                <span style={{
                  width: "20px",
                  height: "3px",
                  background: "#657D7A",
                  borderRadius: "5px",
                }} />
                Gross profit
              </div>

              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#64717C",
              }}>
                <span style={{
                  width: "20px",
                  height: "3px",
                  background: "#A9947A",
                  borderRadius: "5px",
                }} />
                Gross margin
              </div>
            </div>

            {/* CHART */}

            <div style={{ width: "100%", height: "290px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyTrend}
                  margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
                  onClick={(state) => {
                    const point = state?.activePayload?.[0]?.payload;
                    if (point) setSelectedMonth(point);
                  }}
                >
                  <defs>
                    <linearGradient
                      id="monthlyProfitGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#657D7A" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#657D7A" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="#D9DDE0"
                    strokeDasharray="3 5"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#89939B", fontSize: 10 }}
                    axisLine={{ stroke: "#D9DDE0" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />

                  <YAxis
                    yAxisId="profit"
                    orientation="left"
                    tickFormatter={formatShortMoney}
                    tick={{ fill: "#89939B", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={53}
                  />

                  <YAxis
                    yAxisId="margin"
                    orientation="right"
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: "#A9947A", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />

                  <Tooltip
                    cursor={{ stroke: "#C5C9CB", strokeDasharray: "4 4" }}
                    content={<MonthlyTooltip currency={currency} />}
                  />

                  <Area
                    yAxisId="profit"
                    type="monotone"
                    dataKey="gross_profit"
                    stroke="#657D7A"
                    strokeWidth={3}
                    fill="url(#monthlyProfitGradient)"
                    activeDot={{
                      r: 6,
                      fill: "#657D7A",
                      stroke: "#F8F5EF",
                      strokeWidth: 2,
                    }}
                    animationDuration={1200}
                    isAnimationActive
                  />

                  <Line
                    yAxisId="margin"
                    type="monotone"
                    dataKey="gross_margin"
                    stroke="#A9947A"
                    strokeWidth={2.5}
                    strokeDasharray="6 5"
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: "#A9947A",
                      stroke: "#F8F5EF",
                      strokeWidth: 2,
                    }}
                    animationDuration={1400}
                    isAnimationActive
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* MONTH SELECTOR */}

            <div style={{
              borderTop: "1px solid #EAE5DB",
              paddingTop: "16px",
              marginTop: "8px",
            }}>
              <p style={{
                fontSize: "10px",
                color: "#89939B",
                fontWeight: 750,
                letterSpacing: "0.8px",
                margin: "0 0 11px",
              }}>
                INSPECT A MONTH
              </p>

              <div style={{
                display: "flex",
                gap: "7px",
                overflowX: "auto",
                paddingBottom: "7px",
              }}>
                {monthlyTrend.map((item) => {
                  const active = selectedMonth?.month === item.month;

                  return (
                    <button
                      key={item.month}
                      type="button"
                      onClick={() => setSelectedMonth(item)}
                      aria-pressed={active}
                      style={{
                        flexShrink: 0,
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: active ? "1px solid #657D7A" : "1px solid #D9DDE0",
                        background: active ? "#E7E9E2" : "#F3EFE7",
                        color: active ? "#718397" : "#64717C",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SELECTED MONTH DETAILS */}

            {selectedMonth && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "12px",
                marginTop: "15px",
              }}>
                {[
                  ["Gross Sales", formatMoney(selectedMonth.gross_sales, currency), "#718397"],
                  ["Net Cost", formatMoney(selectedMonth.total_net_cost, currency), "#64717C"],
                  ["Cancellation Loss", formatMoney(selectedMonth.cancellation_leakage, currency), "#9B8468"],
                  ["Completed Bookings", selectedMonth.completed_bookings, "#657D7A"],
                ].map(([label, value, color]) => (
                  <div
                    key={label}
                    style={{
                      padding: "13px",
                      borderRadius: "11px",
                      background: "#F3EFE7",
                      border: "1px solid #EAE5DB",
                    }}
                  >
                    <p style={{ fontSize: "10px", color: "#89939B", margin: "0 0 7px" }}>
                      {label}
                    </p>

                    <strong style={{ fontSize: "14px", color }}>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
