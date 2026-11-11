
import { useEffect, useRef, useState } from "react";
<<<<<<< HEAD
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";
=======
>>>>>>> fe70b5b (Add updated project files final one)
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  ShieldAlert,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  Activity,
  TrendingUp,
  Sparkles,
  Info,
} from "lucide-react";

import { api } from "../lib/api.js";
import { PageHeader, Status } from "./ui.jsx";
import "../supplier-anomaly.css";

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function formatPeriod(value) {
  if (!value) return "Select a month";

  const [year, month] = value.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

function MonthPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(
    value ? Number(value.split("-")[0]) : new Date().getFullYear()
  );
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  function chooseMonth(index) {
    onChange(`${visibleYear}-${String(index + 1).padStart(2, "0")}`);
    setOpen(false);
  }

  return (
    <div className="anomaly-month-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`anomaly-month-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Choose price period"
      >
        <span className="anomaly-calendar-icon">
          <CalendarDays size={18} />
        </span>
        <span className="anomaly-month-value">{formatPeriod(value)}</span>
        <ChevronRight
          size={17}
          className={`anomaly-month-chevron ${open ? "rotated" : ""}`}
        />
      </button>

      {open && (
        <div className="anomaly-month-popover">
          <div className="anomaly-month-popover-head">
            <button
              type="button"
              className="anomaly-calendar-nav"
              onClick={() => setVisibleYear((year) => year - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft size={18} />
            </button>

            <strong>{visibleYear}</strong>

            <button
              type="button"
              className="anomaly-calendar-nav"
              onClick={() => setVisibleYear((year) => year + 1)}
              aria-label="Next year"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="anomaly-month-grid">
            {MONTHS.map((month, index) => {
              const monthValue = `${visibleYear}-${String(index + 1).padStart(2, "0")}`;
              const selected = value === monthValue;

              return (
                <button
                  type="button"
                  key={month}
                  className={`anomaly-month-option ${selected ? "selected" : ""}`}
                  onClick={() => chooseMonth(index)}
                >
                  {month.slice(0, 3)}
                </button>
              );
            })}
          </div>

          <div className="anomaly-calendar-footer">
            Choose the month for the supplier price
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierAnomalyPage() {
<<<<<<< HEAD
  // The model works in USD. Prices are typed and shown in the preferred display currency.
  const fx = useDisplayCurrency();
=======
>>>>>>> fe70b5b (Add updated project files final one)
  const [items, setItems] = useState([]);
  const [parentId, setParentId] = useState("");
  const [period, setPeriod] = useState("2028-01");
  const [price, setPrice] = useState("");
  const [loadingItems, setLoadingItems] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const selectedItem = items.find(
    (item) => String(item.parent_id) === String(parentId)
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadItems() {
      try {
        const data = await api("/anomalies/items", {
          signal: controller.signal,
        });

        const loadedItems = data.items || [];
        setItems(loadedItems);

        if (loadedItems.length) {
          setParentId(String(loadedItems[0].parent_id));
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.detail || "Could not load inventory items.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingItems(false);
        }
      }
    }

    loadItems();

    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!parentId || !period || price === "") {
      setError("Please complete all fields.");
      return;
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Enter a valid supplier price.");
      return;
    }

<<<<<<< HEAD
    const priceUsd = fx.toUsd(numericPrice);
    if (priceUsd == null) {
      setError(`No exchange rate is available for ${fx.currency}. Switch your display currency to USD in your profile.`);
      return;
    }

=======
>>>>>>> fe70b5b (Add updated project files final one)
    setChecking(true);
    setError("");
    setResult(null);

    try {
      const data = await api("/anomalies/detect", {
        method: "POST",
        body: JSON.stringify({
          parent_id: parentId,
          period,
<<<<<<< HEAD
          price_usd: Math.round(priceUsd * 100) / 100,
=======
          price_usd: numericPrice,
>>>>>>> fe70b5b (Add updated project files final one)
        }),
      });

      setResult(data.result);
    } catch (err) {
      setError(
        err.detail ||
        "Could not analyse the supplier price. Check your backend."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="anomaly-page">
      <PageHeader
        eyebrow="SUPPLIER INTELLIGENCE"
        title="Supplier price anomalies"
        description="Monitor supplier pricing and identify unusual changes before they affect your margins."
      />

      <section className="anomaly-hero">
        <div className="anomaly-hero-copy">
          <div className="anomaly-hero-icon">
            <ShieldAlert size={22} />
          </div>

          <div>
            <span className="anomaly-overline">PRICE INTELLIGENCE</span>
            <h2>Stay ahead of unusual pricing.</h2>
            <p>
              Compare incoming supplier rates with historical inventory
              patterns using machine learning and rule-based checks.
            </p>
          </div>
        </div>

        <div className="anomaly-hero-decoration" aria-hidden="true">
          <div className="anomaly-decoration-ring ring-one" />
          <div className="anomaly-decoration-ring ring-two" />
          <Activity size={66} strokeWidth={1.1} />
        </div>
      </section>

      <div className="anomaly-workspace">
        <main className="anomaly-main-column">
          <section className="anomaly-card">
            <div className="anomaly-card-heading">
              <div>
                <span className="anomaly-overline">NEW ANALYSIS</span>
                <h2>Analyse a supplier price</h2>
                <p>
                  Enter the proposed supplier rate to check whether it
                  falls outside the expected range.
                </p>
              </div>

              <span className="anomaly-heading-icon">
                <TrendingUp size={20} />
              </span>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="anomaly-field anomaly-field-full">
                <span>Inventory item</span>
                <div className="anomaly-input-wrap">
                  <Package size={17} />
                  <select
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                    disabled={loadingItems || !items.length}
                    required
                  >
                    {loadingItems && <option value="">Loading items...</option>}

                    {!loadingItems && !items.length && (
                      <option value="">No inventory items available</option>
                    )}

                    {items.map((item) => (
                      <option
                        key={item.parent_id}
                        value={item.parent_id}
                      >
                        {item.name} ({item.parent_id})
                      </option>
                    ))}
                  </select>
                </div>
                <small>Select the inventory item from your records.</small>
              </label>

              <label className="anomaly-field">
                <span>Price period</span>
                <MonthPicker value={period} onChange={setPeriod} />
                <small>Choose the month of the supplier quotation.</small>
              </label>

              <label className="anomaly-field">
<<<<<<< HEAD
                <span>Supplier price ({fx.currency})</span>
                <div className="anomaly-input-wrap price-input-wrap">
                  <span className="anomaly-currency">{fx.currency}</span>
=======
                <span>Supplier price (USD)</span>
                <div className="anomaly-input-wrap price-input-wrap">
                  <span className="anomaly-currency">$</span>
>>>>>>> fe70b5b (Add updated project files final one)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
<<<<<<< HEAD
                <small>
                  {fx.currency === "USD"
                    ? "Enter the quoted price in US dollars."
                    : `Enter the quoted price in ${fx.currency}. It is converted to USD at a ${fx.rateLabel} for the model.`}
                </small>
=======
                <small>Enter the quoted price in US dollars.</small>
>>>>>>> fe70b5b (Add updated project files final one)
              </label>

              <button
                className="anomaly-submit"
                type="submit"
                disabled={checking || loadingItems || !items.length}
              >
                {checking ? (
                  <span className="anomaly-spinner" />
                ) : (
                  <Search size={17} />
                )}
                {checking ? "Analysing price..." : "Run price analysis"}
                {!checking && <ChevronRight size={17} />}
              </button>
            </form>

            {error && (
              <div className="anomaly-error" role="alert">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}
          </section>

          {result && (
            <section className="anomaly-result">
              <div className="anomaly-result-head">
                <div>
                  <span className="anomaly-overline">ANALYSIS COMPLETE</span>
                  <h2>
                    {result.final_flag
                      ? "Unusual price detected"
                      : "No anomaly detected"}
                  </h2>
                  <p>
                    {result.final_flag
                      ? "This supplier price should be reviewed."
                      : "The submitted price is within the expected range."}
                  </p>
                </div>

                <Status tone={result.final_flag ? "gold" : "sage"}>
                  {result.final_flag ? "Review required" : "Within expected range"}
                </Status>
              </div>

              <div className="anomaly-result-grid">
                <div>
                  <span>Supplier price</span>
<<<<<<< HEAD
                  <strong>{fx.format(result.price_usd, "USD")}</strong>
                  {fx.currency !== "USD" && <small>{`USD ${Number(result.price_usd).toFixed(2)} analysed`}</small>}
=======
                  <strong>${Number(result.price_usd).toFixed(2)}</strong>
>>>>>>> fe70b5b (Add updated project files final one)
                </div>
                <div>
                  <span>Machine learning</span>
                  <strong>{result.ml_flag ? "Flagged" : "Not flagged"}</strong>
                </div>
                <div>
                  <span>Rule-based check</span>
                  <strong>{result.rule_flag ? "Flagged" : "Not flagged"}</strong>
                </div>
                <div>
                  <span>Final decision</span>
                  <strong>{result.final_flag ? "Anomaly" : "Normal"}</strong>
                </div>
              </div>

              <div className="anomaly-reasons">
                <h3>Detection explanation</h3>

                {result.explanation?.length ? (
                  <ul>
                    {result.explanation.map((reason, index) => (
                      <li key={index}>
                        <AlertTriangle size={16} />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="anomaly-no-reasons">
                    <CheckCircle2 size={17} />
                    No unusual pricing pattern was identified.
                  </p>
                )}
              </div>

              <p className="anomaly-disclaimer">
                An anomaly is a signal for manual review, not proof of
                supplier fraud. Verify the quotation independently.
              </p>
            </section>
          )}
        </main>

        <aside className="anomaly-side-column">
          <section className="anomaly-side-card anomaly-context-card">
            <div className="anomaly-side-card-heading">
              <div className="anomaly-side-icon">
                <Sparkles size={19} />
              </div>
              <span>INTELLIGENCE OVERVIEW</span>
            </div>

            <h3>A clearer view of supplier pricing.</h3>
            <p>
              Use historical price patterns to spot potential changes
              before approving a supplier quotation.
            </p>

            <div className="anomaly-side-divider" />

            <div className="anomaly-context-row">
              <span>Inventory items loaded</span>
              <strong>{loadingItems ? "…" : items.length}</strong>
            </div>

            <div className="anomaly-context-row">
              <span>Selected item</span>
              <strong className="anomaly-context-value">
                {selectedItem?.name || (loadingItems ? "Loading..." : "None")}
              </strong>
            </div>

            <div className="anomaly-context-row">
              <span>Analysis period</span>
              <strong>{formatPeriod(period)}</strong>
            </div>
          </section>

          <section className="anomaly-side-card anomaly-steps-card">
            <span className="anomaly-overline">HOW IT WORKS</span>
            <h3>Three checks. One clearer decision.</h3>

            <div className="anomaly-step">
              <span className="anomaly-step-number">01</span>
              <div>
                <strong>Historical comparison</strong>
                <p>Compare the submitted price with historical rates.</p>
              </div>
            </div>

            <div className="anomaly-step">
              <span className="anomaly-step-number">02</span>
              <div>
                <strong>Intelligent detection</strong>
                <p>Check for unusual patterns using the detection model.</p>
              </div>
            </div>

            <div className="anomaly-step">
              <span className="anomaly-step-number">03</span>
              <div>
                <strong>Review the result</strong>
                <p>See the flags and explanation before taking action.</p>
              </div>
            </div>
          </section>

          <div className="anomaly-side-note">
            <Info size={17} />
            <p>
              Detection results support supplier review. Always verify
              quotations before making purchasing decisions.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
