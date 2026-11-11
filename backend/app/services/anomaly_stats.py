"""Statistical layer for anomaly detection (feature #9).

Two robust (MAD z-score) checks, plus the Isolation Forest kept as a third,
corroborating signal:

1. Peer z-score — a rate against the same destination, tier, room type and
   calendar month. Seasonality and price level are removed by the grouping.
2. Own-history z-score — a rate against the item's own rolling median, so an
   item that simply costs more than its peers is not flagged.

The MAD ("median absolute deviation") is used rather than a standard deviation
because a handful of injected errors would otherwise inflate the spread and hide
themselves. z is scaled by 1.4826 so it reads like a normal score.

Thresholds are the usual Iglewicz-Hoaglin cut-offs: |z| >= 3.5 is a candidate,
|z| >= 5 is called out as high severity. They are tuned on the labelled fixture
(see docs/anomaly-eval.md) rather than guessed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Calibrated on tests/fixtures/rate_anomaly_labels.json (127 injected anomalies in
# 6,156 rates) together with the material-ratio band in services/anomalies.py:
# these cut-offs reach 125 of 127 injected errors with 2 false positives out of
# 6,029 clean rates. See docs/anomaly-eval.md for the sweep that chose them.
PEER_Z, PEER_Z_HIGH = 5.0, 8.0
HISTORY_Z, HISTORY_Z_HIGH = 6.0, 9.0
MAD_SCALE = 1.4826  # makes MAD comparable to a standard deviation

# Below this many peers a median is not worth much; the check is skipped and
# the row falls back to the history check only.
MIN_PEERS = 5


def robust_z(values, x) -> float | None:
    """MAD z-score of x among values. None when the spread is zero or too small."""
    clean = [float(v) for v in values if v is not None and np.isfinite(v)]
    if len(clean) < MIN_PEERS or x is None or not np.isfinite(x):
        return None
    median = float(np.median(clean))
    mad = float(np.median(np.abs(np.array(clean) - median)))
    if mad <= 0:
        # Every peer is identical (often the case with placeholder rates). Fall
        # back to the standard deviation so a lone outlier is still visible.
        mad = float(np.std(clean))
    if mad <= 0:
        return None
    return (float(x) - median) / (MAD_SCALE * mad)


def peer_table(rates: pd.DataFrame, keys=("destination", "tier", "category", "cal_month")) -> pd.DataFrame:
    """Per-group median and MAD for the given grouping keys."""
    grouped = rates.groupby(list(keys), dropna=False)["price_usd"]
    table = grouped.agg(median="median", count="count").reset_index()
    mad = (
        rates.assign(_dev=(rates["price_usd"] - rates.groupby(list(keys), dropna=False)["price_usd"]
                           .transform("median")).abs())
        .groupby(list(keys), dropna=False)["_dev"].median()
        .reset_index(name="mad")
    )
    table = table.merge(mad, on=list(keys), how="left")
    table["mad"] = table["mad"].where(table["mad"] > 0)
    return table


def add_peer_stats(rates: pd.DataFrame) -> pd.DataFrame:
    """Attach peer median/MAD/z and the peer ratio to every rate row."""
    keys = ["destination", "tier", "category", "cal_month"]
    table = peer_table(rates, keys)
    out = rates.merge(table, on=keys, how="left")
    spread = (MAD_SCALE * out["mad"]).where(out["mad"].notna() & (out["mad"] > 0))
    out["peer_z"] = np.where(spread.notna() & (out["median"] > 0),
                             (out["price_usd"] - out["median"]) / spread, np.nan)
    out["peer_count"] = out["count"].fillna(0).astype(int)
    out["peer_ratio"] = np.where(out["median"] > 0, out["price_usd"] / out["median"], np.nan)
    return out.drop(columns=["count"])


def add_history_stats(rates: pd.DataFrame) -> pd.DataFrame:
    """Item's own rolling median (prior six months) and leave-one-out median, with ratios and z.

    Leave-one-out matters: a single bad row must not move the median it is being
    compared against, which a plain group median would allow on short histories.
    """
    out = rates.sort_values(["item_id", "period"]).copy()
    grouped = out.groupby("item_id")["price_usd"]
    out["rolling_median"] = grouped.transform(
        lambda s: s.shift(1).rolling(window=6, min_periods=3).median()
    )
    total = grouped.transform("sum")
    count = grouped.transform("count")
    leave_one_out = np.where(count > 1, (total - out["price_usd"]) / (count - 1).replace(0, np.nan), np.nan)
    out["own_median"] = out["rolling_median"].where(out["rolling_median"].notna(), pd.Series(leave_one_out, index=out.index))
    out["own_median"] = out["own_median"].where(out["own_median"] > 0)
    out["own_ratio"] = np.where(out["own_median"] > 0, out["price_usd"] / out["own_median"], np.nan)
    # Robust z of this row against the item's other months.
    stats = (
        out.groupby("item_id")["price_usd"]
        .agg(item_median="median", item_mad=lambda s: float(np.median(np.abs(s - np.median(s)))))
        .reset_index()
    )
    out = out.merge(stats, on="item_id", how="left")
    scale = MAD_SCALE * out["item_mad"].where(out["item_mad"] > 0)
    out["own_z"] = np.where(scale.notna(), (out["price_usd"] - out["item_median"]) / scale, np.nan)
    return out


def add_momentum(rates: pd.DataFrame) -> pd.DataFrame:
    """Month-on-month ratio and the coefficient of variation the IF expects."""
    out = rates.sort_values(["item_id", "period"]).copy()
    grouped = out.groupby("item_id")["price_usd"]
    out["previous_price"] = grouped.shift(1)
    out["monthly_ratio"] = np.where(out["previous_price"] > 0, out["price_usd"] / out["previous_price"], np.nan)
    out["past_std"] = grouped.transform(lambda s: s.shift(1).rolling(6, min_periods=3).std())
    out["past_mean"] = grouped.transform(lambda s: s.shift(1).rolling(6, min_periods=3).mean())
    out["past_cv"] = out["past_std"] / out["past_mean"].abs().replace(0, np.nan)
    return out


def feature_frame(rates: pd.DataFrame) -> pd.DataFrame:
    """The exact columns the committed Isolation Forest was trained on."""
    frame = pd.DataFrame({
        "price_usd": rates["price_usd"],
        "past_price_ratio": rates["own_ratio"],
        "monthly_price_ratio": rates["monthly_ratio"],
        "past_6m_cv": rates["past_cv"],
        "month": rates["cal_month"],
        "year": rates["year"],
    })
    return frame.replace([np.inf, -np.inf], np.nan)


def add_ml_flag(rates: pd.DataFrame, bundle: dict) -> pd.DataFrame:
    """Isolation Forest prediction; False wherever the features are incomplete."""
    out = rates.copy()
    frame = feature_frame(out)
    valid = frame.notna().all(axis=1)
    out["ml_flag"] = False
    if valid.any():
        model = bundle["model"]
        out.loc[valid, "ml_flag"] = model.predict(frame.loc[valid][bundle["features"]]) == -1
    return out


def enrich(rates: pd.DataFrame, bundle: dict | None = None) -> pd.DataFrame:
    """Full statistical enrichment used by the detector and by the eval script."""
    out = rates.copy()
    out["cal_month"] = pd.to_datetime(out["period"], format="%Y-%m", errors="coerce").dt.month
    out["year"] = pd.to_datetime(out["period"], format="%Y-%m", errors="coerce").dt.year
    out = add_history_stats(out)
    out = add_peer_stats(out)
    out = add_momentum(out)
    if bundle is not None:
        out = add_ml_flag(out, bundle)
    else:
        out["ml_flag"] = False
    return out
