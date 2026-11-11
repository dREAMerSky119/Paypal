import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPeriod } from "../lib/format.js";
<<<<<<< HEAD
import { formatDisplayPrice } from "../lib/currency.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";

const compact = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function RateChart({ rates, currency, displayCurrency }) {
  const fx = useDisplayCurrency();
  displayCurrency = displayCurrency ?? fx.currency;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const quotes = rates.map((r) => formatDisplayPrice({ amount: r.net_price, sourceCurrency: currency, usdReference: r.net_price_usd, displayCurrency, rates: fx.rates, rateNote: fx.rateLabel }));
  const chartCurrency = quotes[0]?.currency || currency;
  const data = rates.map((r, index) => ({ period: r.period, price: quotes[index].amount }));
  return <div className="inv-chart" role="img" aria-label={`Monthly net rate shown in ${chartCurrency}; supplier quote currency ${currency}; preferred currency ${displayCurrency}. ${formatPeriod(rates[0].period)} to ${formatPeriod(rates.at(-1).period)}.`}>
=======

const compact = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function RateChart({ rates, currency }) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const data = rates.map((r) => ({ period: r.period, price: r.net_price }));
  return <div className="inv-chart" role="img" aria-label={`Monthly net rate in ${currency}, ${formatPeriod(rates[0].period)} to ${formatPeriod(rates.at(-1).period)}. A table with the same values follows.`}>
>>>>>>> fe70b5b (Add updated project files final one)
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#ece9e1" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(p) => p.endsWith("-01") ? p.slice(0, 4) : ""} interval={0} tick={{ fontSize: 9, fill: "#7c878e" }} tickLine={false} axisLine={{ stroke: "#e3e0d8" }} />
        <YAxis tickFormatter={compact} width={44} tick={{ fontSize: 9, fill: "#7c878e" }} tickLine={false} axisLine={false} />
<<<<<<< HEAD
        <Tooltip formatter={(v) => [formatMoney(v, chartCurrency), `Net rate (${chartCurrency})`]} labelFormatter={formatPeriod} contentStyle={{ fontSize: 11, border: "1px solid #e3e0d8", borderRadius: 0, background: "#fbfaf6" }} />
=======
        <Tooltip formatter={(v) => [formatMoney(v, currency), "Net rate"]} labelFormatter={formatPeriod} contentStyle={{ fontSize: 11, border: "1px solid #e3e0d8", borderRadius: 0, background: "#fbfaf6" }} />
>>>>>>> fe70b5b (Add updated project files final one)
        {data.some((d) => d.period === current) && <ReferenceLine x={current} stroke="#b98939" strokeDasharray="3 3" />}
        <Line type="monotone" dataKey="price" stroke="#172b40" strokeWidth={1.6} dot={{ r: 2, fill: "#172b40" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
