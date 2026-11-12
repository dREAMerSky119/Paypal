"""Deterministic rule layer for anomaly detection (feature #9).

Pure functions only: no pandas, no database, no file reads. Each rule is
unit-testable on its own, and the same code runs on the seeded rates, on a CSV
import, and on a single price typed into the UI.

Every rule returns a list of "findings". A finding is the unit the feed shows:

    {"layer": "rule" | "text", "code": "ten_x", "severity": "high",
     "detail": "one plain-language sentence"}
"""
from __future__ import annotations

import re

from rapidfuzz import fuzz, process

SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}

# A ratio within this relative tolerance of a slip factor counts as that factor.
SLIP_TOLERANCE = 0.05
# Only factors that move a price enough to be unmistakable. Reference FX rates sit
# near 1 for the USD pegs (0.92 EUR), and a 0.92/1.09 match would turn every
# ordinary price into a "slip", so factors in this band are ignored.
SLIP_MIN_FACTOR, SLIP_MAX_NEUTRAL = 0.67, 1.5
# Factors a currency slip realistically produces: a hundred-fold/decimal slip,
# and the reference FX rates the seed is converted with.
DEFAULT_SLIP_FACTORS = (0.01, 0.1, 100.0, 1000.0)

# Ratio to peers at which each rule fires.
TEN_X, HUNDRED_X = 10.0, 100.0
TENTH_X = 0.1
DIGIT_TOO_MANY = 5.0    # one digit too many, but not a full ten-fold jump
DIGIT_DROPPED = 0.3     # one digit dropped

WORD = re.compile(r"[A-Za-z\u00c0-\u024f][A-Za-z\u00c0-\u024f'\-]+")
SAMPLE_SUFFIX = re.compile(r"\s*[\u00b7|\-–]\s*sample\s*\d+\s*$", re.IGNORECASE)


def finding(code: str, severity: str, detail: str, layer: str = "rule") -> dict:
    """One reason to look at a subject. All feed copy is built from these."""
    return {"layer": layer, "code": code, "severity": severity, "detail": detail}


# ------------------------------------------------------------------ field rules

def missing_fields(record: dict, required=("price_usd",)) -> list[dict]:
    """Required fields that are absent. A row that cannot be read cannot be trusted."""
    out = []
    for name in required:
        value = record.get(name)
        empty = value is None or (isinstance(value, str) and not value.strip())
        if empty:
            label = name.replace("_", " ")
            out.append(finding("missing_field", "medium",
                               f"The {label} is missing, so this row cannot be priced or compared."))
    return out


def price_value(price, currency: str = "USD") -> list[dict]:
    """Zero, negative, sub-penny and non-numeric prices."""
    if price is None:
        return []
    try:
        value = float(price)
    except (TypeError, ValueError):
        return [finding("not_a_number", "high",
                        f"The price '{price}' is not a number, so it cannot be quoted.")]
    if value < 0:
        return [finding("negative_price", "high",
                        f"A {currency} price of {value:,.2f} is negative. Supplier rates are never refunds, "
                        "so this is an entry error.")]
    if value == 0:
        return [finding("zero_price", "high",
                        "The price is zero. A free rate is possible, but in this inventory it is almost "
                        "always a missing value that was saved as 0.")]
    if value < 0.01:
        return [finding("below_penny", "medium",
                        f"A price of {value:,.4f} {currency} is below one cent.")]
    return []


def peer_ratio(observed, expected) -> list[dict]:
    """The 10x and 100x checks against the peer median, plus the digit-slip band."""
    if observed is None or not expected or expected <= 0:
        return []
    try:
        ratio = float(observed) / float(expected)
    except (TypeError, ValueError, ZeroDivisionError):
        return []
    if ratio <= 0:
        return []
    if ratio >= HUNDRED_X:
        return [finding("hundred_x", "high",
                        f"It reads {ratio:,.0f} times the peer median: two decimal places too far.")]
    if ratio >= TEN_X:
        return [finding("ten_x", "high",
                        f"It reads {ratio:,.1f} times the peer median: one decimal place too far.")]
    if ratio >= DIGIT_TOO_MANY:
        return [finding("digit_too_many", "medium",
                        f"It reads {ratio:,.1f} times the peer median, the band a slipped digit produces.")]
    if ratio <= TENTH_X:
        return [finding("tenth_x", "high",
                        f"It reads {ratio:.3f} of the peer median: a tenth of the price or less.")]
    if ratio <= DIGIT_DROPPED:
        return [finding("digit_dropped", "medium",
                        f"It reads {ratio:.2f} of the peer median, as if a digit had been dropped.")]
    return []


def currency_slip(observed, expected, factors=()) -> list[dict]:
    """A ratio that matches a currency conversion factor rather than a price change."""
    if observed is None or not expected or expected <= 0 or float(observed) <= 0:
        return []
    ratio = float(observed) / float(expected)
    seen = set()
    for raw in (*DEFAULT_SLIP_FACTORS, *factors):
        try:
            factor = float(raw)
        except (TypeError, ValueError):
            continue
        if factor <= 0 or factor in seen:
            continue
        if SLIP_MIN_FACTOR <= factor <= SLIP_MAX_NEUTRAL:
            continue
        seen.add(factor)
        if abs(ratio - factor) / factor <= SLIP_TOLERANCE:
            direction = "converted twice" if factor > 1 else "converted the wrong way"
            return [finding("currency_slip", "high",
                            f"The price is {factor:g}x the expected level, which matches a currency "
                            f"{direction} rather than a real price change "
                            f"(expected about {float(expected):,.2f}).")]
    return []


# ------------------------------------------------------------------- text layer

def _normalise(name: str) -> str:
    """Lower-case, drop the sample marker, strip punctuation and collapse spaces."""
    text = SAMPLE_SUFFIX.sub("", str(name or ""))
    text = re.sub(r"[^a-z0-9\u00c0-\u024f]+", " ", text.lower())
    return " ".join(text.split())


def vocabulary_words(vocabulary) -> set[str]:
    """Every distinct word used by the destination, attraction and supplier names."""
    words: set[str] = set()
    for entry in vocabulary:
        for token in WORD.findall(str(entry or "")):
            if len(token) >= 3:
                words.add(token.lower())
    return words


def text_typo(text: str, words, threshold: int = 80, max_findings: int = 2) -> list[dict]:
    """Tokens that are not in the vocabulary but are close to a word that is.

    Guards against false positives on correct names, which matter more than
    catching every typo: the token must start with the same letter as its
    candidate and be within two characters of its length. A destination name that
    simply is not in the vocabulary scores too low to pass that test.
    """
    if not text:
        return []
    known = words if isinstance(words, (set, frozenset)) else vocabulary_words(words)
    if not known:
        return []
    lowered = [w.lower() for w in WORD.findall(str(text))]
    matched = set(lowered)
    out = []
    for index, token in enumerate(lowered):
        # A word split by a stray space: "Lad in" for "Ladin". Checked before the
        # length guard because the first half is often only three letters.
        joined = (token + lowered[index + 1]) if index + 1 < len(lowered) else ""
        if len(joined) >= 4 and joined in known:
            out.append(finding("text_split_word", "medium",
                               f"'{lowered[index]} {lowered[index + 1]}' looks like the single word "
                               f"'{joined}' from the vocabulary.", layer="text"))
            if len(out) >= max_findings:
                return out
            continue
        if len(token) < 4 or token in known:
            continue
        candidates = [word for word in known
                      if word[0] == token[0] and abs(len(word) - len(token)) <= 2]
        if not candidates:
            continue
        match = process.extractOne(token, candidates, scorer=fuzz.ratio, score_cutoff=threshold)
        if not match:
            continue
        best, score = match[0], match[1]
        if best in matched:  # the correct spelling is also present: the text is fine
            continue
        out.append(finding("text_typo", "medium",
                           f"'{token}' looks like '{best}' misspelt ({score:.0f}% match); "
                           "the name does not match the place vocabulary.", layer="text"))
        if len(out) >= max_findings:
            break
    return out


def split_word(text: str, words, min_len: int = 4) -> list[dict]:
    """A known word broken by a stray space, e.g. 'Lad in' for 'Ladin'."""
    if not text:
        return []
    known = words if isinstance(words, (set, frozenset)) else vocabulary_words(words)
    joined = re.sub(r"\s+", "", str(text)).lower()
    out = []
    for word in sorted(known):
        if len(word) < min_len:
            continue
        as_text = str(text).lower()
        if word in as_text:
            continue
        if word in joined:
            out.append(finding("text_split_word", "medium",
                               f"'{word}' appears split by a space in this text; the vocabulary uses "
                               f"'{word}' as one word.", layer="text"))
    return out


def duplicate_suppliers(suppliers, threshold: int = 92) -> list[tuple]:
    """Supplier records in the same destination whose names are the same or nearly so.

    `suppliers` is a list of {id, name, destination}. The seeded sample marker
    ("· Sample 07") is stripped first so numbered placeholders are not mistaken
    for duplicates. Returns (id_a, id_b, name_a, name_b, finding) tuples so the
    caller can build a stable key per pair.
    """
    by_dest: dict[str, list[tuple[str, str, str]]] = {}
    for supplier in suppliers:
        key = str(supplier.get("destination") or "")
        by_dest.setdefault(key, []).append(
            (str(supplier.get("id")), str(supplier.get("name") or ""), _normalise(supplier.get("name")))
        )
    out = []
    for dest, rows in by_dest.items():
        for i, (id_a, name_a, norm_a) in enumerate(rows):
            if not norm_a:
                continue
            for id_b, name_b, norm_b in rows[i + 1:]:
                if not norm_b:
                    continue
                if norm_a == norm_b:
                    out.append((id_a, id_b, name_a, name_b,
                                finding("duplicate_supplier", "medium",
                                        f"'{name_a}' and '{name_b}' are the same supplier recorded twice "
                                        f"in {dest}.", layer="text")))
                    continue
                score = fuzz.token_sort_ratio(norm_a, norm_b)
                if score >= threshold:
                    out.append((id_a, id_b, name_a, name_b,
                                finding("near_duplicate_supplier", "low",
                                        f"'{name_a}' and '{name_b}' are {score:.0f}% similar; one may be a "
                                        f"duplicate of the other in {dest}.", layer="text")))
    return out


def highest(findings) -> dict | None:
    """The finding that sets an anomaly's severity (ties go to the earliest)."""
    if not findings:
        return None
    return max(findings, key=lambda f: SEVERITY_RANK.get(f.get("severity"), 0))


def severity_of(findings, floor: str | None = None) -> str:
    top = highest(findings)
    severity = top["severity"] if top else "low"
    if floor and SEVERITY_RANK.get(floor, 0) > SEVERITY_RANK.get(severity, 0):
        return floor
    return severity
