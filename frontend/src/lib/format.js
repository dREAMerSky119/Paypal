const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "MONDAY, 9 NOVEMBER 2026" (hand-built so it never depends on ICU locale data). */
export function formatEyebrowDate(date = new Date()) {
  return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`.toUpperCase();
}

/** "24 Sep 2026" */
export function formatShortDate(date) {
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** 5 -> "05" */
export const pad2 = (n) => String(n).padStart(2, "0");

/** 1200, "MAD" -> "MAD 1,200"; decimals only for small amounts. Never throws on an odd currency code. */
export function formatMoney(amount, currency = "USD") {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const digits = Math.abs(n) >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: digits, maximumFractionDigits: digits })
      .format(n).replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${n.toLocaleString("en", { maximumFractionDigits: digits })}`;
  }
}

/** "2026-03" -> "Mar 2026" */
export function formatPeriod(period) {
  const [y, m] = String(period).split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : String(period);
}
