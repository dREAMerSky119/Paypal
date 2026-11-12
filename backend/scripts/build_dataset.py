#!/usr/bin/env python3
"""
Wayfare dataset builder -> wayfare_master.csv  (ONE csv, many record_types)

Usage:
  python build_dataset.py --frontend ../frontend/src/data/destinations.js \
      --raw ./raw --out wayfare_master.csv

--raw must contain (the script downloads them if the network allows):
  hotels.csv    Hotel Booking Demand (TidyTuesday copy of Antonio et al.)
  airports.csv  OurAirports

Provenance is recorded per row in `data_origin`:
  real_public         taken straight from a public dataset
  curated             hand-entered from public knowledge (coords, events)
  synthetic_calibrated generated, shapes calibrated from real data
  synthetic_sample    generated placeholder (names, rates, bookings)
  assumption          editable modelling assumption (simulator, FX, carbon)
Everything synthetic is meant to be replaced/overwritten by real data later.
"""
import argparse, json, math, os, subprocess, sys, urllib.request
from datetime import date, timedelta
import numpy as np
import pandas as pd

SEED = 20261109
rng = np.random.default_rng(SEED)

COLUMNS = [
    "record_type", "record_id", "parent_id", "related_id", "destination_slug", "country",
    "name", "category", "subtype", "tier", "lat", "lon", "date", "date_end", "period",
    "currency", "price_net", "price_sell", "price_net_usd", "fees", "quantity", "nights",
    "lead_time_days", "is_canceled", "index_value", "index_low", "index_high",
    "rate_multiplier", "demand_multiplier", "score", "distance_km", "travel_min",
    "verification", "data_origin", "source_note", "anomaly_label", "text", "attrs_json",
]

RAW_URLS = {
    "hotels.csv": "https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2020/2020-02-11/hotels.csv",
    "airports.csv": "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv",
}

rows = []


def add(**kw):
    r = {c: None for c in COLUMNS}
    attrs = kw.pop("attrs", None)
    for k, v in kw.items():
        assert k in r, k
        r[k] = v
    r["attrs_json"] = json.dumps(attrs, ensure_ascii=False) if attrs else None
    rows.append(r)


def haversine(a, b, c, d):
    R = 6371.0088
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = p2 - p1, math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# ----------------------------------------------------------------------------
# 0. Inputs
# ----------------------------------------------------------------------------
def ensure_raw(raw):
    os.makedirs(raw, exist_ok=True)
    for f, u in RAW_URLS.items():
        p = os.path.join(raw, f)
        if not os.path.exists(p):
            print("downloading", f)
            urllib.request.urlretrieve(u, p)


def load_destinations(js_path):
    code = ('import {destinations as d} from %s; console.log(JSON.stringify(d))'
            % json.dumps("file://" + os.path.abspath(js_path)))
    tmp = os.path.abspath(js_path)
    out = subprocess.run(["node", "--input-type=module", "-e",
                          'import {destinations as d} from "%s"; console.log(JSON.stringify(d))' % tmp],
                         capture_output=True, text=True)
    if out.returncode != 0:  # .js without "type":"module" -> copy as .mjs
        import shutil, tempfile
        t = os.path.join(tempfile.mkdtemp(), "d.mjs")
        shutil.copy(js_path, t)
        out = subprocess.run(["node", "--input-type=module", "-e",
                              'import {destinations as d} from "%s"; console.log(JSON.stringify(d))' % t],
                             capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ----------------------------------------------------------------------------
# 1. Curated reference tables (public knowledge; coordinates approximate ~100 m)
# ----------------------------------------------------------------------------
SPOT_COORDS = {  # attraction name -> (lat, lon)
    "Lago di Braies": (46.6945, 12.0850), "Tre Cime di Lavaredo": (46.6186, 12.3025),
    "Alpe di Siusi": (46.5436, 11.6256),
    "Fushimi Inari Shrine": (34.9671, 135.7727), "Arashiyama Bamboo Grove": (35.0170, 135.6713),
    "Kinkaku-ji": (35.0394, 135.7292), "Gion District": (35.0037, 135.7756),
    "Nishiki Market": (35.0050, 135.7649),
    "Jemaa el-Fnaa": (31.6258, -7.9891), "Bahia Palace": (31.6217, -7.9835),
    "Jardin Majorelle": (31.6417, -8.0033),
    "Dal Lake": (34.1180, 74.8700), "Nishat Bagh": (34.1233, 74.8761), "Pahalgam Valley": (34.0161, 75.3150),
    "Amber Fort": (26.9855, 75.8513), "Hawa Mahal": (26.9239, 75.8267), "Jantar Mantar": (26.9247, 75.8244),
    "City Palace": (24.5764, 73.6835), "Lake Pichola": (24.5720, 73.6790), "Jagdish Temple": (24.5805, 73.6835),
    "Fort Kochi": (9.9658, 76.2421), "Alappuzha Backwaters": (9.4981, 76.3388), "Munnar Tea Country": (10.0889, 77.0595),
    "Leh Palace": (34.1649, 77.5858), "Nubra Valley": (34.5410, 77.5610), "Thiksey Monastery": (34.0575, 77.6665),
    "Living Root Bridges": (25.2500, 91.6950), "Dawki River": (25.1890, 92.0230), "Shillong": (25.5788, 91.8933),
    "Ubud": (-8.5069, 115.2625), "Tegallalang Rice Terraces": (-8.4312, 115.2793), "Uluwatu Temple": (-8.8291, 115.0849),
    "Þingvellir National Park": (64.2559, -21.1299), "Reynisfjara Coast": (63.4044, -19.0716), "Reykjavík": (64.1466, -21.9426),
    "Amalfi Town": (40.6340, 14.6027), "Path of the Gods": (40.6290, 14.5560), "Ravello": (40.6492, 14.6112),
}

# destination -> localities used as anchors for synthetic suppliers (real places)
LOCALITIES = {
    "dolomites-italy": [("Cortina d'Ampezzo", 46.5405, 12.1357), ("Ortisei", 46.5746, 11.6710), ("San Candido", 46.7339, 12.2822),
                        ("Corvara in Badia", 46.5517, 11.8783), ("Castelrotto", 46.5693, 11.5612), ("Villabassa", 46.7360, 12.1700)],
    "kyoto-japan": [("Higashiyama", 35.0037, 135.7800), ("Arashiyama", 35.0094, 135.6761), ("Fushimi", 34.9671, 135.7727),
                    ("Kyoto Station", 34.9858, 135.7588), ("Kita Ward", 35.0394, 135.7292), ("Nakagyo", 35.0116, 135.7681)],
    "marrakech-morocco": [("Medina", 31.6295, -7.9811), ("Gueliz", 31.6350, -8.0100), ("Mellah", 31.6217, -7.9835),
                          ("Palmeraie", 31.6700, -7.9500), ("Agafay", 31.4800, -8.1500)],
    "kashmir-india": [("Srinagar Dal Gate", 34.0890, 74.8300), ("Nishat", 34.1233, 74.8761), ("Pahalgam", 34.0161, 75.3150),
                      ("Gulmarg", 34.0484, 74.3805), ("Sonamarg", 34.3000, 75.2900)],
    "jaipur-india": [("Old City", 26.9239, 75.8267), ("Amer", 26.9855, 75.8513), ("C-Scheme", 26.9124, 75.7873),
                     ("Bani Park", 26.9300, 75.7900), ("Sanganer", 26.8200, 75.7900)],
    "udaipur-india": [("Old City", 24.5764, 73.6835), ("Pichola Ghats", 24.5714, 73.6797), ("Fateh Sagar", 24.6000, 73.6757),
                      ("Shilpgram", 24.5900, 73.6450), ("Eklingji", 24.6900, 73.6950)],
    "kerala-india": [("Fort Kochi", 9.9658, 76.2421), ("Alappuzha", 9.4981, 76.3388), ("Munnar", 10.0889, 77.0595),
                     ("Kumarakom", 9.6177, 76.4300), ("Thekkady", 9.6000, 77.1600), ("Varkala", 8.7379, 76.7163)],
    "ladakh-india": [("Leh", 34.1526, 77.5771), ("Diskit", 34.5410, 77.5610), ("Thiksey", 34.0575, 77.6665),
                     ("Hemis", 33.9150, 77.7020), ("Alchi", 34.2200, 77.1700)],
    "meghalaya-india": [("Shillong", 25.5788, 91.8933), ("Sohra", 25.2700, 91.7200), ("Mawlynnong", 25.2000, 91.9200),
                        ("Dawki", 25.1890, 92.0230), ("Nongriat", 25.2500, 91.6950)],
    "bali-indonesia": [("Ubud", -8.5069, 115.2625), ("Seminyak", -8.6913, 115.1683), ("Uluwatu", -8.8291, 115.0849),
                       ("Sidemen", -8.4900, 115.4400), ("Munduk", -8.2600, 115.0700), ("Canggu", -8.6500, 115.1300)],
    "iceland": [("Reykjavik", 64.1466, -21.9426), ("Selfoss", 63.9331, -21.0010), ("Vik", 63.4195, -19.0060),
                ("Thingvellir", 64.2559, -21.1299), ("Hella", 63.8330, -20.3830)],
    "amalfi-coast-italy": [("Amalfi", 40.6340, 14.6027), ("Positano", 40.6280, 14.4840), ("Ravello", 40.6492, 14.6112),
                           ("Agerola", 40.6310, 14.5440), ("Praiano", 40.6120, 14.5240), ("Maiori", 40.6490, 14.6420)],
}

# currency, USD->local rate (ASSUMPTION; edit in fx_assumption rows), price level, shape, style
TAGS = {
    "dolomites-italy": ["mountain", "hiking", "alpine", "local-culture", "lakes"],
    "kyoto-japan": ["heritage", "temples", "city", "food", "culture"],
    "marrakech-morocco": ["heritage", "city", "markets", "craft", "architecture", "gardens"],
    "kashmir-india": ["mountain", "lakes", "gardens", "hiking", "houseboats"],
    "jaipur-india": ["heritage", "forts", "craft", "city", "architecture"],
    "udaipur-india": ["heritage", "lakes", "palaces", "craft", "city"],
    "kerala-india": ["backwaters", "coast", "tea", "food", "nature"],
    "ladakh-india": ["mountain", "high-altitude", "monasteries", "hiking", "culture"],
    "meghalaya-india": ["forest", "waterfalls", "community", "nature", "rivers"],
    "bali-indonesia": ["island", "temples", "craft", "rice-terraces", "coast"],
    "iceland": ["volcanic", "nature", "coast", "road-trip", "geothermal"],
    "amalfi-coast-italy": ["coast", "hiking", "food", "towns", "gardens"],
}

DEST = {
    #  slug:              cur,   fx,     stay_mid_usd, guide_day, exp_pp, xfer_veh, driver_day, popularity, kind,    conf,    airport
    "dolomites-italy":   ("EUR", 0.92,   165, 280, 75, 180, 220, 1.0, "resort", "high",   ["VCE", "TSF", "BZO", "INN"]),
    "kyoto-japan":       ("JPY", 150.0,  150, 190, 85, 150, 160, 1.6, "city",   "medium", ["KIX", "ITM"]),
    "marrakech-morocco": ("MAD", 9.9,     85,  70, 35,  25,  85, 1.3, "city",   "medium", ["RAK"]),
    "kashmir-india":     ("INR", 88.0,    55,  45, 20,  20,  60, 0.9, "resort", "low",    ["SXR"]),
    "jaipur-india":      ("INR", 88.0,    60,  40, 22,  18,  50, 1.4, "city",   "low",    ["JAI"]),
    "udaipur-india":     ("INR", 88.0,    70,  40, 24,  20,  50, 1.1, "city",   "low",    ["UDR"]),
    "kerala-india":      ("INR", 88.0,    70,  45, 25,  25,  70, 1.3, "resort", "low",    ["COK"]),
    "ladakh-india":      ("INR", 88.0,    60,  55, 25,  15,  90, 0.8, "resort", "low",    ["IXL"]),
    "meghalaya-india":   ("INR", 88.0,    45,  30, 15,  60,  70, 0.6, "resort", "low",    ["GAU", "SHL"]),
    "bali-indonesia":    ("IDR", 16300.0, 80,  55, 28,  30,  60, 1.6, "resort", "medium", ["DPS"]),
    "iceland":           ("ISK", 138.0,  190, 300, 95, 170, 220, 1.0, "resort", "medium", ["KEF", "RKV"]),
    "amalfi-coast-italy": ("EUR", 0.92,  230, 160, 70, 140, 180, 1.2, "resort", "high",   ["NAP", "QSR"]),
}

# 12-month relative demand shapes Jan..Dec (hand-built from the best-time notes: ASSUMPTION)
SHAPE = {
    "dolomites-italy": [.75, .80, .60, .25, .30, .65, 1.0, 1.0, .70, .30, .15, .80],
    "kyoto-japan": [.50, .55, .90, 1.0, .80, .60, .65, .65, .65, .85, 1.0, .70],
    "marrakech-morocco": [.60, .65, .85, 1.0, .80, .45, .35, .40, .65, .95, .80, .85],
    "kashmir-india": [.35, .35, .45, .80, 1.0, 1.0, .80, .70, .60, .60, .30, .35],
    "jaipur-india": [.95, .90, .65, .35, .20, .15, .20, .25, .35, .75, 1.0, 1.0],
    "udaipur-india": [.95, .90, .65, .35, .20, .15, .20, .25, .35, .75, 1.0, 1.0],
    "kerala-india": [.90, .85, .70, .50, .40, .30, .30, .35, .40, .60, .85, 1.0],
    "ladakh-india": [.10, .10, .10, .25, .65, 1.0, 1.0, 1.0, .80, .35, .10, .10],
    "meghalaya-india": [.60, .70, .80, .80, .50, .20, .15, .15, .35, .90, 1.0, .85],
    "bali-indonesia": [.60, .55, .55, .70, .75, .85, 1.0, 1.0, .85, .80, .65, .95],
    "iceland": [.35, .40, .45, .45, .60, .90, 1.0, 1.0, .75, .50, .35, .50],
    "amalfi-coast-italy": [.08, .10, .20, .55, .80, .95, 1.0, 1.0, .90, .60, .12, .10],
}
GROWTH = {s: g for s, g in zip(SHAPE, [0.05, 0.07, 0.06, 0.08, 0.07, 0.07, 0.07, 0.09, 0.10, 0.06, 0.05, 0.04])}
# 2022 recovery multiplier by country (ASSUMPTION shaped like national reopening)
REOPEN_2022 = {"Japan": [.04] * 9 + [.35, .5, .55], "India": [.55, .35, .6, .75, .8, .85, .9, .9, .92, .95, .95, .95],
               "Morocco": [.5, .6, .7, .85, .9, .9, .9, .92, .95, .95, .95, .95], "Indonesia": [.4, .4, .45, .5, .55, .6, .7, .75, .8, .85, .9, .9]}

TIER_F = {"budget": 0.45, "mid": 1.0, "luxury": 2.6}
MARKUP = {"stay": {"budget": .16, "mid": .20, "luxury": .26}, "guide": .30, "experience": .35, "transport": .20}

STAY_STYLES = {  # tier -> (subtype, room_type, ownership options)
    "budget": [("guesthouse", "double_room"), ("homestay", "private_room")],
    "mid": [("guesthouse", "double_room"), ("boutique_hotel", "double_room"), ("rifugio_or_lodge", "double_room")],
    "luxury": [("boutique_hotel", "suite"), ("heritage_hotel", "suite")],
}


def build_destinations(dests):
    for d in dests:
        slug = d["slug"]
        spots = [SPOT_COORDS[a["name"]] for a in d["attractions"]]
        lat = float(np.mean([p[0] for p in spots])); lon = float(np.mean([p[1] for p in spots]))
        locs = LOCALITIES[slug]
        lats = [p[0] for p in spots] + [l[1] for l in locs]; lons = [p[1] for p in spots] + [l[2] for l in locs]
        pad = 0.25
        bbox = [round(min(lons) - pad, 4), round(min(lats) - pad, 4), round(max(lons) + pad, 4), round(max(lats) + pad, 4)]
        cur = DEST[slug][0]
        add(record_type="destination", record_id=slug, destination_slug=slug, country=d["country"], name=d["name"],
            category=d["type"], lat=round(lat, 5), lon=round(lon, 5), currency=cur, text=d["editorial"],
            data_origin="curated", source_note="from frontend destinations.js; centre = mean of attraction coords",
            attrs={"bbox_west_south_east_north": bbox, "best_time": d["bestTime"], "duration": d["duration"],
                   "related_hand_wired": d.get("related", []), "card_title": d["cardTitle"], "tags": TAGS[slug]})


def build_spots(dests):
    n = 0
    for d in dests:
        for a in d["attractions"]:
            n += 1
            la, lo = SPOT_COORDS[a["name"]]
            hrs = a["duration"]
            add(record_type="spot", record_id=f"spot_{n:03d}", destination_slug=d["slug"], country=d["country"], name=a["name"],
                category=a["category"], subtype="attraction", lat=la, lon=lo, text=a["description"],
                data_origin="curated", source_note="name/description from destinations.js; coords from public knowledge (approx)",
                attrs={"location_label": a["location"], "typical_duration": hrs, "image_id": a["image"]})


# ----------------------------------------------------------------------------
# 2. Real-data calibration from Hotel Booking Demand
# ----------------------------------------------------------------------------
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def build_hotel_calibration(h):
    h = h.copy()
    h["m"] = h.arrival_date_month.map({m: i + 1 for i, m in enumerate(MONTHS)})
    h["nights"] = h.stays_in_weekend_nights + h.stays_in_week_nights
    ok = h[(h.adr > 0) & (h.adr < 1000) & (h.is_canceled == 0)]
    prof = {}
    for hotel in ["Resort Hotel", "City Hotel"]:
        sub = h[h.hotel == hotel]
        adr_m = ok[ok.hotel == hotel].groupby("m").adr.mean()
        adr_idx = adr_m / adr_m.mean()
        canc = sub.groupby("m").is_canceled.mean()
        lead = sub.groupby("m").lead_time.mean()
        share = sub.groupby("m").size() / len(sub)
        prof[hotel] = {"peak_trough": float(adr_idx.max() / adr_idx.min())}
        for m in range(1, 13):
            add(record_type="seasonality_profile", record_id=f"hbd_{hotel.split()[0].lower()}_{m:02d}", name=hotel,
                subtype=hotel.split()[0].lower(), period=f"m{m:02d}", index_value=round(float(adr_idx[m]), 4),
                score=round(float(canc[m]), 4), lead_time_days=round(float(lead[m]), 1), quantity=round(float(share[m]), 4),
                data_origin="real_public",
                source_note="Hotel Booking Demand (Antonio, Almeida, Nunes 2019). index_value=ADR/annual mean (non-cancelled, 0<ADR<1000); "
                            "score=cancellation rate; lead_time_days=mean; quantity=share of bookings. Shapes only, not price levels.")
    return h, prof


def build_hbd_sample(h):
    """2,000 random real rows + every ADR outlier (<=0 handled as label) -> anomaly benchmark."""
    s = h.sample(2000, random_state=1)
    out = h[(h.adr < 0) | (h.adr >= 500)]
    s = pd.concat([s, out]).drop_duplicates()
    for i, r in enumerate(s.itertuples()):
        lab = "negative_adr" if r.adr < 0 else "extreme_adr" if r.adr >= 500 else ("zero_adr" if r.adr == 0 else None)
        add(record_type="hbd_sample", record_id=f"hbd_{i:05d}", name=r.hotel, subtype=r.hotel.split()[0].lower(),
            category=r.market_segment, country=r.country if isinstance(r.country, str) else None,
            period=f"{r.arrival_date_year}-{r.m:02d}", price_net=float(r.adr), currency="EUR", nights=int(r.nights),
            lead_time_days=int(r.lead_time), is_canceled=int(r.is_canceled),
            quantity=float((r.adults or 0) + (0 if pd.isna(r.children) else r.children)),
            anomaly_label=lab, data_origin="real_public",
            source_note="real Hotel Booking Demand row; price_net holds ADR; use to validate anomaly detector (known 5400 and negative ADR)",
            attrs={"deposit_type": r.deposit_type, "distribution_channel": r.distribution_channel})


# ----------------------------------------------------------------------------
# 3. Demand (monthly index) -- synthetic_calibrated
# ----------------------------------------------------------------------------
def shape_norm(slug):
    s = np.array(SHAPE[slug], float)
    return s / s.mean()


def demand_series(country_of):
    """returns {(slug,'YYYY-MM'): index}. 100 = destination's 2024 monthly average."""
    out = {}
    for slug in SHAPE:
        base = shape_norm(slug)
        for y in range(2022, 2027):
            for m in range(1, 13):
                if (y, m) > (2026, 10):
                    continue
                trend = (1 + GROWTH[slug]) ** (y + (m - 1) / 12 - 2024)
                reopen = 1.0
                if y == 2022:
                    reopen = REOPEN_2022.get(country_of[slug], [0.85] * 12)[m - 1]
                noise = float(np.exp(rng.normal(0, 0.05)))
                out[(slug, f"{y}-{m:02d}")] = 100 * base[m - 1] * trend * reopen * noise
    return out


def build_demand(dests):
    country_of = {d["slug"]: d["country"] for d in dests}
    ser = demand_series(country_of)
    for (slug, per), v in ser.items():
        conf = DEST[slug][9]
        add(record_type="demand_monthly", record_id=f"dem_{slug}_{per}", destination_slug=slug, country=country_of[slug],
            period=per, date=f"{per}-01", index_value=round(v, 2), subtype=conf,
            data_origin="synthetic_calibrated",
            source_note="Hand-built monthly seasonal shape x yearly growth x 2022 reopening x noise. REPLACE with Eurostat/JNTO/state data "
                        "where available. India = national shape scaled, so confidence=low.",
            attrs={"method": "shape*trend*reopening*noise", "base": "2024 monthly mean = 100"})
    return ser


# ----------------------------------------------------------------------------
# 4. Suppliers, items, rates
# ----------------------------------------------------------------------------
def rate_index(slug, prof):
    """12 monthly price multipliers with real peak/trough amplitude from Hotel Booking Demand."""
    kind = DEST[slug][8]
    pt = prof["Resort Hotel" if kind == "resort" else "City Hotel"]["peak_trough"]
    pt = min(max(pt, 1.3), 2.4)  # real Algarve-style resort amplitude (3.7x) is capped for other destinations
    s = np.array(SHAPE[slug], float)
    z = (s - s.min()) / (s.max() - s.min()) - 0.5
    idx = np.exp(math.log(pt) * z)
    return idx / idx.mean()


def lognorm(sig):
    return float(np.exp(rng.normal(0, sig)))


OWN_BY_SUBTYPE = {"guesthouse": ["independent_local", "family_run", "family_run", "independent_local"],
                  "homestay": ["family_run", "family_run", "independent_local"],
                  "boutique_hotel": ["independent_local", "regional_group", "independent_local", "chain"],
                  "rifugio_or_lodge": ["family_run", "family_run", "independent_local"],
                  "heritage_hotel": ["independent_local", "chain", "regional_group"],
                  "guide_collective": ["cooperative", "independent_local"],
                  "independent_guide": ["independent_local"],
                  "community_host": ["cooperative", "family_run"],
                  "transport_operator": ["independent_local", "regional_group"]}
CERTS = ["GSTC-recognised standard", "Travelife", "Green Key", "Fair Trade Tourism", "B Corp"]


def build_suppliers_items(dests, prof):
    sup_id = 0; item_id = 0
    items = []  # dicts
    for d in dests:
        slug = d["slug"]; cur, fx, stay_mid, guide_d, exp_pp, xfer, driver, pop, kind, conf, airports = DEST[slug]
        locs = LOCALITIES[slug]
        plan = []  # (supplier_subtype, tier, item_type, item_name_hint)
        tiers = ["budget", "budget", "mid", "mid", "mid", "luxury"]
        for t in tiers:
            st = STAY_STYLES[t][int(rng.integers(len(STAY_STYLES[t])))]
            plan.append(("stay", st[0], t, st[1], None))
        plan += [("guide", "guide_collective", "mid", "full_day_guide", None),
                 ("guide", "independent_guide", "mid", "full_day_guide", None),
                 ("guide", "independent_guide", "budget", "half_day_guide", None)]
        for e in d["experiences"]:
            plan.append(("experience", "community_host", "mid", "small_group_experience", e))
        plan += [("transport", "transport_operator", "mid", "airport_transfer", None),
                 ("transport", "transport_operator", "mid", "private_driver_day", None)]
        for kind_i, subtype, tier, cat, exp_text in plan:
            sup_id += 1; item_id += 1
            loc = locs[int(rng.integers(len(locs)))]
            jlat, jlon = loc[1] + rng.normal(0, 0.004), loc[2] + rng.normal(0, 0.004)
            sid = f"sup_{sup_id:03d}"; iid = f"item_{item_id:04d}"
            own = str(rng.choice(OWN_BY_SUBTYPE[subtype]))
            brand = "Sample Hotels Group" if own == "chain" else None
            nm = {"stay": f"{loc[0]} {subtype.replace('_', ' ').title()} · Sample {sup_id:02d}",
                  "guide": f"{loc[0]} {'Guides Collective' if subtype == 'guide_collective' else 'Independent Guide'} · Sample {sup_id:02d}",
                  "experience": f"{loc[0]} Community Host · Sample {sup_id:02d}",
                  "transport": f"{loc[0]} Transfers · Sample {sup_id:02d}"}[kind_i]
            add(record_type="supplier", record_id=sid, destination_slug=slug, country=d["country"], name=nm, subtype=subtype,
                tier=tier, lat=round(jlat, 5), lon=round(jlon, 5), currency=cur, data_origin="synthetic_sample",
                source_note="placeholder name anchored to a real locality; replace with Overture Places via enrich_overture.py",
                attrs={"supplier_kind": kind_i, "ownership": own, "chain_brand": brand, "locality": loc[0], "overture_id": None})
            # price in USD per unit
            if kind_i == "stay":
                base = stay_mid * TIER_F[tier]; unit = "per_room_night"; capacity = 2 if cat != "suite" else 3; markup = MARKUP["stay"][tier]
                iname = f"{nm.split(' · ')[0]} – {cat.replace('_', ' ')}"; itype = "stay"
            elif kind_i == "guide":
                base = guide_d * (0.55 if cat == "half_day_guide" else 1.0) * (0.8 if subtype == "guide_collective" else 1.0)
                unit = "per_guide_day" if cat != "half_day_guide" else "per_guide_half_day"; capacity = 8; markup = MARKUP["guide"]
                iname = f"{loc[0]} {cat.replace('_', ' ')}"; itype = "guide"
            elif kind_i == "experience":
                base = exp_pp * lognorm(0.12); unit = "per_person"; capacity = 8; markup = MARKUP["experience"]
                iname = exp_text.rstrip("."); itype = "experience"
            else:
                base = xfer if cat == "airport_transfer" else driver; unit = "per_vehicle" if cat == "airport_transfer" else "per_vehicle_day"
                capacity = 4; markup = MARKUP["transport"]; iname = f"{loc[0]} {cat.replace('_', ' ')}"; itype = "transport"
            base_usd = base * lognorm(0.15)
            add(record_type="item", record_id=iid, parent_id=sid, destination_slug=slug, country=d["country"], name=iname,
                category=cat, subtype=itype, tier=tier, lat=round(jlat, 5), lon=round(jlon, 5), currency=cur,
                price_net=round(base_usd * fx, 2), price_net_usd=round(base_usd, 2), quantity=capacity,
                data_origin="synthetic_sample", source_note="base net rate (mid-season, local currency) from price model; see rate rows for monthly values",
                attrs={"unit": unit, "markup_pct": round(markup * 100, 1)})
            items.append(dict(iid=iid, sid=sid, slug=slug, type=itype, tier=tier, base_usd=base_usd, cur=cur, fx=fx, subtype=subtype,
                              ownership=own, lat=jlat, lon=jlon, markup=markup, country=d["country"], unit=unit, cat=cat))
    return items


ANOM_TYPES = ["extra_zero", "missing_zero", "negative", "zero", "currency_slip", "spike"]


def build_rates(items, prof):
    ridx = {s: rate_index(s, prof) for s in SHAPE}
    periods = [f"{y}-{m:02d}" for y in (2025, 2026, 2027) for m in range(1, 13)]
    n = 0
    clean_rate = {}
    for it in items:
        for p in periods:
            m = int(p[5:]); y = int(p[:4])
            infl = {2025: 0.96, 2026: 1.0, 2027: 1.04}[y]
            usd = it["base_usd"] * ridx[it["slug"]][m - 1] * infl * lognorm(0.03)
            local = round(usd * it["fx"], 2)
            clean_rate[(it["iid"], p)] = (usd, local)
            n += 1
            label = None; shown = local; note = None
            if rng.random() < 0.02:
                label = str(rng.choice(ANOM_TYPES))
                if label == "extra_zero": shown = round(local * 10, 2)
                elif label == "missing_zero": shown = round(local / 10, 2)
                elif label == "negative": shown = -abs(local)
                elif label == "zero": shown = 0.0
                elif label == "currency_slip": shown = round(usd, 2) if it["cur"] != "EUR" else round(local * 92, 2)
                elif label == "spike": shown = round(local * float(rng.uniform(2.2, 3.5)), 2)
                note = "INJECTED anomaly for evaluation; true value in attrs_json.true_price_net"
            occ = float(np.clip(0.35 + 0.55 * (SHAPE[it["slug"]][m - 1]) + rng.normal(0, 0.04), 0.05, 0.98)) if it["type"] == "stay" else None
            add(record_type="rate", record_id=f"rate_{n:06d}", parent_id=it["iid"], destination_slug=it["slug"], country=it["country"],
                period=p, date=f"{p}-01", currency=it["cur"], price_net=shown, price_net_usd=round(shown / it["fx"], 2) if shown is not None else None,
                index_value=None if occ is None else round(occ, 3), anomaly_label=label, data_origin="synthetic_sample",
                source_note=note or "monthly net rate; seasonality amplitude from Hotel Booking Demand ADR peak/trough (capped at 2.4x)",
                attrs={"true_price_net": local, "unit": it["unit"]} if label else {"unit": it["unit"]})
    return clean_rate


# ----------------------------------------------------------------------------
# 5. Responsible-travel claims (synthetic registry) + scoring
# ----------------------------------------------------------------------------
W = {"local_ownership": 35, "certification": 30, "community_benefit": 20, "environmental": 15}


def build_claims(items):
    cid = 0
    scored = {}
    seen = set()
    for it in items:
        sid = it["sid"]
        if sid in seen:
            continue
        seen.add(sid)
        claims = []
        own = it["ownership"]
        claims.append(("local_ownership", {"independent_local": "independent, locally owned", "family_run": "family-run",
                                           "cooperative": "community cooperative", "regional_group": "regional group",
                                           "chain": "international chain"}[own],
                       own in ("independent_local", "family_run", "cooperative")))
        if rng.random() < 0.35:
            claims.append(("certification", str(rng.choice(CERTS)), True))
        if it["subtype"] in ("guide_collective", "independent_guide", "community_host") and rng.random() < 0.8:
            claims.append(("community_benefit", "licensed local guide / community-run" if it["subtype"] != "community_host" else "income shared with host community", True))
        if rng.random() < 0.4:
            claims.append(("environmental", str(rng.choice(["refillable water + waste separation", "solar hot water", "plastic-free breakfast", "public-transport pickup"])), True))
        score_v = 0; score_c = 0
        for ctype, val, positive in claims:
            r = rng.random()
            ver = "verified" if r < 0.45 else "self_reported" if r < 0.85 else "unverified"
            weight = W[ctype] if positive else 0
            if ctype == "local_ownership" and own == "regional_group": weight = W[ctype] * 0.4
            score_c += weight
            if ver == "verified": score_v += weight
            cid += 1
            add(record_type="responsible_claim", record_id=f"clm_{cid:04d}", parent_id=sid, destination_slug=it["slug"], category=ctype,
                text=val, verification=ver, score=round(weight, 1), data_origin="synthetic_sample",
                source_note="synthetic registry entry; real entries must carry an evidence URL/document")
        scored[sid] = (min(score_v, 100), min(score_c, 100))
    # write supplier scores back
    for r in rows:
        if r["record_type"] == "supplier" and r["record_id"] in scored:
            r["score"] = round(scored[r["record_id"]][0], 1)
            a = json.loads(r["attrs_json"]); a["score_if_self_reported_counted"] = round(scored[r["record_id"]][1], 1)
            r["attrs_json"] = json.dumps(a, ensure_ascii=False)


# ----------------------------------------------------------------------------
# 6. Bookings simulated with real lead-time / cancellation / deposit joint shapes
# ----------------------------------------------------------------------------
def build_bookings(items, h, ser, clean_rate, dests):
    by_dest = {}
    for it in items:
        by_dest.setdefault(it["slug"], []).append(it)
    hh = h[(h.adr > 0) & (h.adr < 1000)]
    pools = {(hot, m): g.reset_index(drop=True) for (hot, m), g in hh.groupby(["hotel", "m"])}
    country_of = {d["slug"]: d["country"] for d in dests}
    markets = {"India": (["IND"], [1.0])}
    top = hh.country.value_counts(normalize=True).head(12)
    start = date(2025, 5, 1); end = date(2026, 10, 31)
    t = 0; b = 0
    for slug, its in by_dest.items():
        kind = DEST[slug][8]; pop = DEST[slug][7]
        hotel = "Resort Hotel" if kind == "resort" else "City Hotel"
        for y in (2025, 2026):
            for m in range(1, 13):
                if not (start <= date(y, m, 1) <= end): continue
                per = f"{y}-{m:02d}"
                dem = ser[(slug, per)] / 100
                ntrips = int(max(1, rng.poisson(6.5 * pop * dem)))
                for _ in range(ntrips):
                    t += 1
                    r = pools[(hotel, m)].iloc[int(rng.integers(len(pools[(hotel, m)])))]
                    nights = int(np.clip(r.stays_in_weekend_nights + r.stays_in_week_nights, 1, 10))
                    lead = int(r.lead_time); canc = int(r.is_canceled)
                    dim = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
                    day = int(rng.integers(1, dim + 1)); ci = date(y, m, day)
                    if ci > end: continue
                    co = ci + timedelta(days=nights); bd = ci - timedelta(days=lead)
                    trav = int(np.clip(r.adults + (0 if pd.isna(r.children) else r.children), 1, 6))
                    dep = r.deposit_type
                    src = "IND" if country_of[slug] == "India" and rng.random() < 0.7 else (r.country if isinstance(r.country, str) else "UNK")
                    # unrecovered loss on a cancelled booking, as a share of net cost (ASSUMPTION): a non-refundable deposit is kept
                    # by the agency, so it costs nothing; no-deposit cancellations cost admin/late-release losses.
                    # NB: real Hotel Booking Demand has a quirk -- almost every "Non Refund" booking is cancelled.
                    pen_share = {"No Deposit": 0.08, "Non Refund": 0.0, "Refundable": 0.10}[dep]
                    lines = []
                    stays = [x for x in its if x["type"] == "stay"]; st = stays[int(rng.integers(len(stays)))]
                    rooms = int(math.ceil(trav / 2))
                    lines.append((st, nights * rooms, "stay"))
                    gd = [x for x in its if x["type"] == "guide"]
                    if rng.random() < 0.55: lines.append((gd[int(rng.integers(len(gd)))], max(1, min(3, nights - 1)), "guide"))
                    ex = [x for x in its if x["type"] == "experience"]
                    if rng.random() < 0.7: lines.append((ex[int(rng.integers(len(ex)))], trav, "experience"))
                    tr = [x for x in its if x["type"] == "transport"]
                    lines.append((tr[0], 1, "transport"))
                    if rng.random() < 0.4: lines.append((tr[1], max(1, nights // 3), "transport"))
                    for it, qty, typ in lines:
                        usd, _ = clean_rate[(it["iid"], per)]
                        net = round(usd * qty, 2)
                        sell = round(net * (1 + it["markup"]), 2)
                        fee = round(0.025 * sell, 2)
                        pen = round(pen_share * net, 2) if canc else 0.0
                        b += 1
                        add(record_type="booking", record_id=f"bk_{b:06d}", parent_id=it["iid"], related_id=f"trip_{t:05d}",
                            destination_slug=slug, country=src, category=r.market_segment, subtype=typ, tier=it["tier"],
                            date=ci.isoformat(), date_end=co.isoformat(), period=per, currency="USD", price_net=net, price_sell=sell,
                            fees=fee, quantity=qty, nights=nights, lead_time_days=lead, is_canceled=canc,
                            data_origin="synthetic_sample",
                            source_note="simulated: lead time, cancellation, deposit type, segment and nights sampled jointly from real Hotel Booking Demand rows (same arrival month); prices from seeded rates",
                            attrs={"booking_date": bd.isoformat(), "travellers": trav, "deposit_type": dep, "cancel_penalty_usd": pen,
                                   "distribution_channel": r.distribution_channel, "supplier_id": it["sid"]})
    print("trips", t, "booking lines", b)


# ----------------------------------------------------------------------------
# 7. Events, macro shocks, FX, carbon, holidays, airports, relations, text tests
# ----------------------------------------------------------------------------
def build_events():
    E = []  # name, slug|ALL|country, start, end, type, demand_mult, rate_mult, origin, note
    def ev(n, where, s, e, t, dm, rm, note, origin="assumption"):
        E.append((n, where, s, e, t, dm, rm, note, origin))
    # recurring cultural / seasonal events (dates approximate unless marked)
    for y in (2026, 2027):
        ev(f"Cherry blossom peak {y}", "kyoto-japan", f"{y}-03-25", f"{y}-04-10", "festival", 1.35, 1.25, "dates vary with bloom forecast; multipliers are assumptions")
        ev(f"Gion Matsuri {y}", "kyoto-japan", f"{y}-07-10", f"{y}-07-24", "festival", 1.25, 1.15, "main processions 17 and 24 July; assumption multipliers")
        ev(f"Autumn leaves peak {y}", "kyoto-japan", f"{y}-11-15", f"{y}-12-05", "seasonal", 1.35, 1.25, "approximate")
        ev(f"Ferragosto week {y}", "amalfi-coast-italy", f"{y}-08-10", f"{y}-08-20", "holiday", 1.20, 1.18, "Italian national holiday 15 Aug")
        ev(f"Ski season opening {y}", "dolomites-italy", f"{y}-12-15", f"{y}-12-31", "seasonal", 1.30, 1.25, "approximate")
        ev(f"Summer hiking peak {y}", "dolomites-italy", f"{y}-07-15", f"{y}-08-20", "seasonal", 1.15, 1.12, "approximate")
        ev(f"Midnight-sun peak {y}", "iceland", f"{y}-06-15", f"{y}-07-15", "seasonal", 1.15, 1.10, "approximate")
        ev(f"Northern-lights season {y}", "iceland", f"{y}-09-15", f"{y}-10-31", "seasonal", 1.10, 1.05, "approximate")
        ev(f"Kerala monsoon onset {y}", "kerala-india", f"{y}-06-01", f"{y}-08-31", "weather", 0.70, 0.80, "Ayurveda/monsoon packages partly offset; assumption")
        ev(f"Meghalaya monsoon {y}", "meghalaya-india", f"{y}-06-15", f"{y}-09-15", "weather", 0.55, 0.75, "assumption")
        ev(f"Ladakh passes open {y}", "ladakh-india", f"{y}-06-01", f"{y}-09-30", "seasonal", 1.30, 1.20, "Manali-Leh and Srinagar-Leh roads typically open; assumption")
        ev(f"Marrakech summer heat {y}", "marrakech-morocco", f"{y}-06-15", f"{y}-08-31", "weather", 0.70, 0.85, "assumption")
        ev(f"Bali dry-season peak {y}", "bali-indonesia", f"{y}-07-01", f"{y}-08-31", "seasonal", 1.20, 1.15, "assumption")
        ev(f"Bali Christmas-NY peak {y}", "bali-indonesia", f"{y}-12-20", f"{y+1}-01-05", "holiday", 1.30, 1.30, "assumption")
        ev(f"Udaipur/Jaipur wedding season {y}", "udaipur-india", f"{y}-11-15", f"{y+1}-02-28", "seasonal", 1.25, 1.30, "assumption")
        ev(f"Shillong cherry-blossom festival {y}", "meghalaya-india", f"{y}-11-10", f"{y}-11-20", "festival", 1.20, 1.10, "approximate")
        ev(f"Kashmir tulip season {y}", "kashmir-india", f"{y}-04-01", f"{y}-04-25", "seasonal", 1.35, 1.20, "approximate")
    # exact dates from the `holidays` package where available
    try:
        import holidays as H
        def hd(country, year, needle):
            for dt, nm in sorted(H.country_holidays(country, years=year).items()):
                if needle.lower() in nm.lower(): return dt
        for y in (2026, 2027):
            d = hd("IN", y, "holi")
            if d: ev(f"Holi {y}", "ALL:India", (d - timedelta(days=2)).isoformat(), (d + timedelta(days=2)).isoformat(), "festival", 1.15, 1.10, "date from `holidays` package; multipliers assumption", "assumption")
            d = hd("IN", y, "diwali")
            if d: ev(f"Diwali {y}", "ALL:India", (d - timedelta(days=4)).isoformat(), (d + timedelta(days=3)).isoformat(), "festival", 1.30, 1.25, "date from `holidays` package; multipliers assumption")
            d = hd("ID", y, "nyepi") or hd("ID", y, "balinese")
            if d: ev(f"Nyepi {y}", "bali-indonesia", (d - timedelta(days=1)).isoformat(), (d + timedelta(days=1)).isoformat(), "holiday", 0.40, 0.90, "Day of Silence: island-wide shutdown; assumption multipliers")
    except Exception as ex:
        print("holidays package unavailable:", ex)
    # fixed-date / approximate astronomical events (verify each year)
    for y in (2026, 2027):
        ev(f"Golden Week {y}", "kyoto-japan", f"{y}-04-29", f"{y}-05-05", "holiday", 1.25, 1.20, "Japan national holidays, fixed dates")
    ev("Ramadan 2026 (approx)", "marrakech-morocco", "2026-02-18", "2026-03-19", "religious", 0.80, 0.90, "approximate lunar dates; verify")
    ev("Ramadan 2027 (approx)", "marrakech-morocco", "2027-02-08", "2027-03-09", "religious", 0.80, 0.90, "approximate lunar dates; verify")
    ev("Eid al-Fitr 2026 (approx)", "marrakech-morocco", "2026-03-18", "2026-03-24", "holiday", 1.20, 1.15, "approximate lunar date; verify")
    ev("Eid al-Fitr 2027 (approx)", "marrakech-morocco", "2027-03-08", "2027-03-14", "holiday", 1.20, 1.15, "approximate lunar date; verify")
    # generic what-if presets for the simulator
    ev("Heavy monsoon (preset)", "ALL:India", "2026-07-01", "2026-09-15", "weather_shock", 0.80, 0.90, "preset: -20% demand")
    ev("Fuel price +20% (preset)", "ALL", "2027-01-01", "2027-03-31", "fuel_price", 0.94, 1.08, "preset; transport costs pass through")
    ev("INR -5% (preset)", "ALL:India", "2027-01-01", "2027-03-31", "currency", 1.04, 0.95, "preset; weaker INR helps inbound, hurts outbound")
    ev("EUR +5% (preset)", "ALL:Italy", "2027-01-01", "2027-03-31", "currency", 0.95, 1.05, "preset")
    ev("Visa easing (preset)", "ALL:India", "2027-01-01", "2027-06-30", "visa_policy", 1.10, 1.03, "preset")
    ev("Regional disruption (preset)", "kashmir-india", "2027-04-01", "2027-06-30", "disruption", 0.45, 0.85, "preset; severe demand drop")
    ev("Airline strike week (preset)", "ALL:Italy", "2027-06-10", "2027-06-17", "disruption", 0.85, 0.98, "preset")
    for i, (n, w, s, e, t, dm, rm, note, org) in enumerate(E, 1):
        slug = w if not w.startswith("ALL") else None
        country = w.split(":")[1] if w.startswith("ALL:") else None
        add(record_type="event", record_id=f"evt_{i:03d}", destination_slug=slug, country=country, name=n, subtype=t, date=s, date_end=e,
            demand_multiplier=dm, rate_multiplier=rm, data_origin="assumption", source_note=note + " | editable assumption, not a measurement",
            attrs={"scope": "all_destinations" if w == "ALL" else ("country" if country else "destination")})
    # macro shocks that the generated demand history already contains (for simulator calibration)
    for i, (n, c, s, e, dm) in enumerate([("Japan reopening (borders reopened Oct 2022)", "Japan", "2022-01-01", "2022-09-30", 0.04),
                                           ("India 2022 recovery", "India", "2022-01-01", "2022-06-30", 0.55),
                                           ("Morocco 2022 recovery", "Morocco", "2022-01-01", "2022-03-31", 0.5),
                                           ("Indonesia 2022 recovery", "Indonesia", "2022-01-01", "2022-06-30", 0.4)], 1):
        add(record_type="macro_shock", record_id=f"shk_{i:02d}", country=c, name=n, subtype="arrivals_shock", date=s, date_end=e,
            demand_multiplier=dm, data_origin="assumption",
            source_note="shape inspired by World Bank ST.INT.ARVL national recoveries; values are NOT the World Bank figures -- replace after download")


FX_VOL = {"EUR": 0.06, "JPY": 0.10, "MAD": 0.04, "INR": 0.04, "IDR": 0.06, "ISK": 0.07, "USD": 0.0}


def build_fx():
    seen = set()
    for slug, v in DEST.items():
        cur, fx = v[0], v[1]
        if cur in seen: continue
        seen.add(cur)
        add(record_type="fx_assumption", record_id=f"fx_{cur}", currency=cur, index_value=fx, score=FX_VOL[cur], data_origin="assumption",
            source_note="units of local currency per 1 USD (reference assumption, NOT live). score = annual volatility used by simulator. "
                        "Refresh from Frankfurter/ECB when network allows.")


def build_carbon():
    F = [("flight_short_haul_economy", "per_pkm", 0.151, "UK GHG conversion factors (order of magnitude from 2023-24 editions)"),
         ("flight_long_haul_economy", "per_pkm", 0.148, "same"), ("flight_domestic", "per_pkm", 0.246, "same"),
         ("rail_national", "per_pkm", 0.035, "same"), ("coach", "per_pkm", 0.027, "same"),
         ("bus_local", "per_pkm", 0.102, "same"), ("car_average", "per_vehicle_km", 0.171, "same"),
         ("taxi_private_driver", "per_vehicle_km", 0.148, "same"), ("ferry_foot_passenger", "per_pkm", 0.019, "same")]
    for i, (m, u, v, n) in enumerate(F, 1):
        add(record_type="emission_factor", record_id=f"ef_{i:02d}", name=m, subtype=u, index_value=v, verification="verify", data_origin="assumption",
            source_note=n + " -- PLACEHOLDER magnitudes from memory (kg CO2e per unit); replace from the official 2026 file before showing numbers as fact")
    HN = {"Italy": 20.0, "Japan": 25.0, "Morocco": 22.0, "India": 24.0, "Indonesia": 28.0, "Iceland": 6.0}
    for j, (c, v) in enumerate(HN.items(), 1):
        add(record_type="emission_factor", record_id=f"ef_hn_{j:02d}", name="hotel_night", subtype="per_room_night", country=c, index_value=v,
            verification="verify", data_origin="assumption", source_note="PLACEHOLDER kg CO2e per room-night; official factors cover few countries -- verify India/Japan/Morocco/Indonesia")


def build_holidays():
    try:
        import holidays as H
    except Exception:
        print("holidays package missing; skipping holiday rows"); return
    n = 0
    for code, cname in [("IN", "India"), ("JP", "Japan"), ("IT", "Italy"), ("MA", "Morocco"), ("ID", "Indonesia"), ("IS", "Iceland")]:
        for y in (2025, 2026, 2027):
            for dt, nm in sorted(H.country_holidays(code, years=y).items()):
                n += 1
                add(record_type="holiday", record_id=f"hol_{n:04d}", country=cname, name=nm, date=dt.isoformat(), period=dt.strftime("%Y-%m"),
                    data_origin="real_public", source_note="`holidays` Python package (MIT)")


def build_airports(raw):
    ap = pd.read_csv(os.path.join(raw, "airports.csv"))
    ap = ap[ap.iata_code.notna()]
    dest_rows = {r["record_id"]: r for r in rows if r["record_type"] == "destination"}
    for slug, codes in [(s, v[10]) for s, v in DEST.items()]:
        d = dest_rows[slug]
        for k, c in enumerate(codes):
            m = ap[ap.iata_code == c]
            if m.empty: print("airport not found", c); continue
            a = m.iloc[0]
            dist = haversine(d["lat"], d["lon"], a.latitude_deg, a.longitude_deg)
            add(record_type="airport", record_id=f"apt_{c}_{slug}", destination_slug=slug, country=a.iso_country, name=a["name"],
                subtype=a["type"], lat=float(a.latitude_deg), lon=float(a.longitude_deg), distance_km=round(dist, 1),
                travel_min=int(dist / 55 * 60 + 25), data_origin="real_public", category="primary" if k == 0 else "alternate",
                source_note="OurAirports (public domain); distance = great-circle from destination centre; travel_min = 55 km/h + 25 min heuristic",
                attrs={"iata": c, "municipality": None if pd.isna(a.municipality) else a.municipality})


def build_relations():
    """near (haversine), similar (TF-IDF on text), day (nearby experience/transport items) -- precomputed top-k."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    spots = [r for r in rows if r["record_type"] == "spot"]
    dests = [r for r in rows if r["record_type"] == "destination"]
    k = 0
    for s in spots:  # near: same destination first, then others
        cand = sorted((haversine(s["lat"], s["lon"], o["lat"], o["lon"]), o) for o in spots if o["record_id"] != s["record_id"] and o["destination_slug"] == s["destination_slug"])[:3]
        for dist, o in cand:
            k += 1
            add(record_type="relation", record_id=f"rel_{k:05d}", parent_id=s["record_id"], related_id=o["record_id"], category="near", subtype="spot",
                distance_km=round(dist, 1), travel_min=int(dist / 40 * 60 + 5), score=round(1 / (1 + dist), 4), destination_slug=s["destination_slug"],
                data_origin="synthetic_calibrated", source_note="haversine; 40 km/h heuristic; same-destination spots only")
    vec = TfidfVectorizer(stop_words="english").fit([s["text"] for s in spots])
    X = vec.transform([s["text"] for s in spots]); S = cosine_similarity(X)
    for i, s in enumerate(spots):
        order = [j for j in np.argsort(-S[i]) if j != i and spots[j]["destination_slug"] != s["destination_slug"]][:2]
        for j in order:
            k += 1
            add(record_type="relation", record_id=f"rel_{k:05d}", parent_id=s["record_id"], related_id=spots[j]["record_id"], category="similar", subtype="spot",
                score=round(float(S[i, j]), 4), destination_slug=s["destination_slug"], data_origin="synthetic_calibrated",
                source_note="TF-IDF cosine on attraction descriptions; swap for Wikipedia/Wikivoyage text + embeddings later")
    # destination-level similarity (replaces hand-wired `related` arrays)
    txt = [d["text"] + " " + (d["category"] or "") for d in dests]
    vec2 = TfidfVectorizer(stop_words="english").fit(txt); S2 = cosine_similarity(vec2.transform(txt))
    tg = [set(TAGS[d["record_id"]]) for d in dests]
    jac = np.array([[len(a & b) / len(a | b) for b in tg] for a in tg])
    S3 = 0.6 * jac + 0.4 * S2
    for i, d in enumerate(dests):
        for j in [j for j in np.argsort(-S3[i]) if j != i][:3]:
            k += 1
            add(record_type="relation", record_id=f"rel_{k:05d}", parent_id=d["record_id"], related_id=dests[j]["record_id"], category="similar", subtype="destination",
                score=round(float(S3[i, j]), 4), data_origin="synthetic_calibrated",
                source_note="0.6*Jaccard(curated tags) + 0.4*TF-IDF(editorial); replaces hand-wired related arrays")
    items = [r for r in rows if r["record_type"] == "item" and r["subtype"] in ("experience", "transport", "guide")]
    for s in spots:  # completes the day: nearest experience/guide items within 90 min
        c = [(haversine(s["lat"], s["lon"], it["lat"], it["lon"]), it) for it in items if it["destination_slug"] == s["destination_slug"]]
        for dist, it in sorted(c, key=lambda x: x[0])[:3]:
            k += 1
            add(record_type="relation", record_id=f"rel_{k:05d}", parent_id=s["record_id"], related_id=it["record_id"], category="day", subtype="item",
                distance_km=round(dist, 1), travel_min=int(dist / 35 * 60 + 5), score=round(1 / (1 + dist), 4), destination_slug=s["destination_slug"],
                data_origin="synthetic_calibrated", source_note="nearest guide/experience/transport items to a spot")


def build_text_tests(dests):
    vocab = []
    for d in dests:
        vocab += [d["name"]] + [a["name"] for a in d["attractions"]]
    for i, v in enumerate(vocab, 1):
        add(record_type="text_vocab", record_id=f"voc_{i:03d}", name=v, data_origin="curated", source_note="canonical vocabulary for typo detection (rapidfuzz)")
    n = 0
    # the real typo found in the repo
    n += 1
    add(record_type="text_test", record_id=f"txt_{n:03d}", text="Lad in and Tyrolean culture", name="Ladin and Tyrolean culture", subtype="split_word_typo",
        anomaly_label="typo", data_origin="real_public", source_note="REAL defect in destinations.js (dolomites-italy highlights)")

    def mut(s):
        s = list(s); i = int(rng.integers(1, max(2, len(s) - 1))); op = rng.choice(["del", "swap", "dup", "sub"])
        if op == "del": del s[i]
        elif op == "swap" and i + 1 < len(s): s[i], s[i + 1] = s[i + 1], s[i]
        elif op == "dup": s.insert(i, s[i])
        else: s[i] = "x"
        return "".join(s)
    for v in vocab[:30]:
        n += 1
        add(record_type="text_test", record_id=f"txt_{n:03d}", text=mut(v), name=v, subtype="injected_typo", anomaly_label="typo", data_origin="synthetic_sample", source_note="injected typo; name=canonical")
    for v in vocab[30:36]:
        n += 1
        add(record_type="text_test", record_id=f"txt_{n:03d}", text=v, name=v, subtype="clean", anomaly_label=None, data_origin="synthetic_sample", source_note="negative control")
    sups = [r for r in rows if r["record_type"] == "supplier"][:6]
    for s in sups:
        n += 1
        add(record_type="text_test", record_id=f"txt_{n:03d}", parent_id=s["record_id"], text=s["name"].replace("Guesthouse", "Guest house").replace("Sample", "Sampel"), name=s["name"],
            subtype="near_duplicate_supplier", anomaly_label="near_duplicate", data_origin="synthetic_sample", source_note="injected near-duplicate supplier name")


# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frontend", default="frontend/src/data/destinations.js")
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="wayfare_master.csv")
    a = ap.parse_args()
    ensure_raw(a.raw)
    dests = load_destinations(a.frontend)
    h = pd.read_csv(os.path.join(a.raw, "hotels.csv"))
    build_destinations(dests); build_spots(dests)
    h, prof = build_hotel_calibration(h); print("peak/trough ADR", {k: round(v["peak_trough"], 2) for k, v in prof.items()})
    ser = build_demand(dests)
    items = build_suppliers_items(dests, prof)
    clean = build_rates(items, prof)
    build_claims(items)
    build_bookings(items, h, ser, clean, dests)
    build_events(); build_fx(); build_carbon(); build_holidays(); build_airports(a.raw)
    build_relations(); build_text_tests(dests); build_hbd_sample(h)
    df = pd.DataFrame(rows, columns=COLUMNS)
    df.to_csv(a.out, index=False)
    print(df.record_type.value_counts().to_string()); print("rows", len(df), "->", a.out)


if __name__ == "__main__":
    main()
