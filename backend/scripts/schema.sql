-- Wayfare schema. Target: Aiven for PostgreSQL (free plan: 1 GB; powers off when idle).
-- Portable types so it also runs on MySQL 8 / SQLite for local tests.
-- Generated tables are loaded from wayfare_master.csv by load_to_sql.py.

CREATE TABLE destination (
  destination_slug VARCHAR(64) PRIMARY KEY, name VARCHAR(120), country VARCHAR(60), category VARCHAR(60),
  lat DOUBLE PRECISION, lon DOUBLE PRECISION, currency VARCHAR(3), editorial TEXT,
  bbox_west_south_east_north TEXT, best_time VARCHAR(120), duration VARCHAR(40), tags TEXT,
  related_hand_wired TEXT, data_origin VARCHAR(30)
);
CREATE TABLE spot (
  spot_id VARCHAR(16) PRIMARY KEY, destination_slug VARCHAR(64), name VARCHAR(160), category VARCHAR(60),
  lat DOUBLE PRECISION, lon DOUBLE PRECISION, description TEXT, location_label VARCHAR(120),
  typical_duration VARCHAR(40), image_id VARCHAR(60), data_origin VARCHAR(30)
);
CREATE TABLE supplier (
  supplier_id VARCHAR(16) PRIMARY KEY, destination_slug VARCHAR(64), name VARCHAR(200), subtype VARCHAR(40), tier VARCHAR(16),
  lat DOUBLE PRECISION, lon DOUBLE PRECISION, currency VARCHAR(3), responsible_score DOUBLE PRECISION,
  supplier_kind VARCHAR(20), ownership VARCHAR(30), chain_brand VARCHAR(60), locality VARCHAR(80),
  overture_id VARCHAR(64), score_if_self_reported_counted DOUBLE PRECISION, data_origin VARCHAR(30)
);
CREATE TABLE item (
  item_id VARCHAR(16) PRIMARY KEY, supplier_id VARCHAR(16), destination_slug VARCHAR(64), name VARCHAR(220),
  category VARCHAR(60), item_type VARCHAR(20), tier VARCHAR(16), lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  currency VARCHAR(3), base_net_price DOUBLE PRECISION, base_net_price_usd DOUBLE PRECISION, capacity DOUBLE PRECISION,
  unit VARCHAR(30), markup_pct DOUBLE PRECISION, data_origin VARCHAR(30)
);
CREATE TABLE rate (
  rate_id VARCHAR(16) PRIMARY KEY, item_id VARCHAR(16), destination_slug VARCHAR(64), period VARCHAR(7), rate_date DATE,
  currency VARCHAR(3), price_net DOUBLE PRECISION, price_net_usd DOUBLE PRECISION, occupancy DOUBLE PRECISION,
  injected_anomaly VARCHAR(20), true_price_net DOUBLE PRECISION, unit VARCHAR(30), data_origin VARCHAR(30)
);
CREATE TABLE booking (
  booking_id VARCHAR(16) PRIMARY KEY, item_id VARCHAR(16), trip_id VARCHAR(16), destination_slug VARCHAR(64),
  source_market VARCHAR(8), market_segment VARCHAR(30), line_type VARCHAR(20), tier VARCHAR(16),
  check_in DATE, check_out DATE, period VARCHAR(7), booking_date DATE, currency VARCHAR(3),
  net_cost DOUBLE PRECISION, sell_price DOUBLE PRECISION, fees DOUBLE PRECISION, quantity DOUBLE PRECISION,
  nights INTEGER, lead_time_days INTEGER, is_canceled INTEGER, cancel_penalty_usd DOUBLE PRECISION,
  travellers INTEGER, deposit_type VARCHAR(20), distribution_channel VARCHAR(20), supplier_id VARCHAR(16), data_origin VARCHAR(30)
);
CREATE TABLE demand_monthly (
  demand_id VARCHAR(64) PRIMARY KEY, destination_slug VARCHAR(64), country VARCHAR(60), period VARCHAR(7), period_date DATE,
  demand_index DOUBLE PRECISION, confidence VARCHAR(10), method VARCHAR(60), data_origin VARCHAR(30)
);
CREATE TABLE seasonality_profile (
  profile_id VARCHAR(24) PRIMARY KEY, hotel_type VARCHAR(20), month_key VARCHAR(4), adr_index DOUBLE PRECISION,
  cancel_rate DOUBLE PRECISION, mean_lead_time_days DOUBLE PRECISION, booking_share DOUBLE PRECISION, data_origin VARCHAR(30)
);
CREATE TABLE event (
  event_id VARCHAR(16) PRIMARY KEY, destination_slug VARCHAR(64), country VARCHAR(60), name VARCHAR(160), event_type VARCHAR(30),
  start_date DATE, end_date DATE, demand_multiplier DOUBLE PRECISION, rate_multiplier DOUBLE PRECISION, scope VARCHAR(30),
  source_note TEXT, data_origin VARCHAR(30)
);
CREATE TABLE macro_shock (
  shock_id VARCHAR(16) PRIMARY KEY, country VARCHAR(60), name VARCHAR(160), start_date DATE, end_date DATE,
  demand_multiplier DOUBLE PRECISION, source_note TEXT
);
CREATE TABLE fx_assumption (currency VARCHAR(3) PRIMARY KEY, per_usd DOUBLE PRECISION, annual_volatility DOUBLE PRECISION, source_note TEXT);
CREATE TABLE emission_factor (
  factor_id VARCHAR(16) PRIMARY KEY, mode VARCHAR(40), unit VARCHAR(20), country VARCHAR(60), kg_co2e DOUBLE PRECISION,
  verification VARCHAR(12), source_note TEXT
);
CREATE TABLE holiday (holiday_id VARCHAR(16) PRIMARY KEY, country VARCHAR(60), name VARCHAR(160), holiday_date DATE, period VARCHAR(7));
CREATE TABLE airport (
  airport_id VARCHAR(40) PRIMARY KEY, destination_slug VARCHAR(64), iata VARCHAR(4), name VARCHAR(160), airport_type VARCHAR(30),
  role VARCHAR(12), lat DOUBLE PRECISION, lon DOUBLE PRECISION, distance_km DOUBLE PRECISION, travel_min INTEGER
);
CREATE TABLE relation (
  relation_id VARCHAR(16) PRIMARY KEY, from_id VARCHAR(24), to_id VARCHAR(24), relation_type VARCHAR(12), entity_kind VARCHAR(12),
  score DOUBLE PRECISION, distance_km DOUBLE PRECISION, travel_min INTEGER, destination_slug VARCHAR(64), source_note TEXT
);
CREATE TABLE responsible_claim (
  claim_id VARCHAR(16) PRIMARY KEY, supplier_id VARCHAR(16), destination_slug VARCHAR(64), claim_type VARCHAR(24),
  claim_text VARCHAR(200), verification VARCHAR(14), weight DOUBLE PRECISION, source_note TEXT
);
CREATE TABLE text_vocab (vocab_id VARCHAR(16) PRIMARY KEY, name VARCHAR(160));
CREATE TABLE text_test (test_id VARCHAR(16) PRIMARY KEY, supplier_id VARCHAR(16), observed_text VARCHAR(300), canonical_text VARCHAR(300), kind VARCHAR(30), label VARCHAR(20), source_note TEXT);
CREATE TABLE hbd_sample (
  hbd_id VARCHAR(16) PRIMARY KEY, hotel_type VARCHAR(20), market_segment VARCHAR(30), nationality VARCHAR(8), period VARCHAR(7),
  adr DOUBLE PRECISION, nights INTEGER, lead_time_days INTEGER, is_canceled INTEGER, guests DOUBLE PRECISION, label VARCHAR(20),
  deposit_type VARCHAR(20), distribution_channel VARCHAR(20)
);

-- App-owned tables (written by the API, not the CSV)
CREATE TABLE package (package_id VARCHAR(40) PRIMARY KEY, title VARCHAR(200), destination_slug VARCHAR(64), start_date DATE, end_date DATE,
  travellers INTEGER, payload TEXT, quote TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE anomaly_resolution (anomaly_key VARCHAR(80) PRIMARY KEY, status VARCHAR(12), note TEXT, resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE advisor_session (session_id VARCHAR(40) PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, request_count INTEGER DEFAULT 0, token_estimate INTEGER DEFAULT 0);

CREATE INDEX ix_item_dest ON item(destination_slug, item_type, tier);
CREATE INDEX ix_rate_item ON rate(item_id, period);
CREATE INDEX ix_booking_dest ON booking(destination_slug, period);
CREATE INDEX ix_booking_item ON booking(item_id);
CREATE INDEX ix_demand_dest ON demand_monthly(destination_slug, period);
CREATE INDEX ix_relation_from ON relation(from_id, relation_type);
CREATE INDEX ix_claim_supplier ON responsible_claim(supplier_id);
