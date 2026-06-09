-- ============================================================
-- Outbound TMS — Cloudflare D1 Schema
-- Migrated from Firebase Firestore
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  uid              TEXT PRIMARY KEY,
  name             TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL UNIQUE,
  role             TEXT NOT NULL DEFAULT 'sales',
  employee_code    TEXT DEFAULT '',
  department       TEXT DEFAULT '',
  lead_id          TEXT DEFAULT '',
  phone            TEXT DEFAULT '',
  status           TEXT DEFAULT 'active',
  password_hash    TEXT DEFAULT '',
  on_leave         INTEGER DEFAULT 0,
  inactive         INTEGER DEFAULT 0,
  disabled         INTEGER DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- ── Sessions (auth) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_uid    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uid) REFERENCES users(uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_uid ON sessions(user_uid);

-- ── Destinations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS destinations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  country     TEXT DEFAULT '',
  description TEXT DEFAULT '',
  data        TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS destination_hotels (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_hotels_dest_id ON destination_hotels(destination_id);

CREATE TABLE IF NOT EXISTS destination_activities (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_activities_dest_id ON destination_activities(destination_id);

CREATE TABLE IF NOT EXISTS destination_transfers (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_transfers_dest_id ON destination_transfers(destination_id);

CREATE TABLE IF NOT EXISTS destination_vehicle_rules (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_vehicle_rules_dest_id ON destination_vehicle_rules(destination_id);

CREATE TABLE IF NOT EXISTS destination_day_plans (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_day_plans_dest_id ON destination_day_plans(destination_id);

CREATE TABLE IF NOT EXISTS destination_attractions (
  id              TEXT PRIMARY KEY,
  destination_id  TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dest_attractions_dest_id ON destination_attractions(destination_id);

-- ── Itineraries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itineraries (
  id                                  TEXT PRIMARY KEY,
  quote_id                            TEXT DEFAULT '',
  status                              TEXT NOT NULL DEFAULT 'draft',
  module                              TEXT DEFAULT 'custom',
  created_by                          TEXT NOT NULL DEFAULT '',
  created_by_name                     TEXT DEFAULT '',
  customer_name                       TEXT DEFAULT '',
  customer_phone                      TEXT DEFAULT '',
  customer_email                      TEXT DEFAULT '',
  customer_id                         TEXT DEFAULT '',
  destination                         TEXT DEFAULT '',
  nights                              INTEGER DEFAULT 0,
  days                                INTEGER DEFAULT 0,
  adults                              INTEGER DEFAULT 1,
  children                            INTEGER DEFAULT 0,
  child_age                           TEXT DEFAULT '',
  start_date                          TEXT DEFAULT '',
  end_date                            TEXT DEFAULT '',
  places_covered                      TEXT DEFAULT '',
  notes                               TEXT DEFAULT '',
  selected_plan_id                    TEXT DEFAULT '',
  plans                               TEXT DEFAULT '[]',
  margin                              REAL DEFAULT 0,
  amount_paid                         REAL DEFAULT 0,
  sales_name                          TEXT DEFAULT '',
  handover_date                       TEXT DEFAULT '',
  assigned_by_sales_id                TEXT DEFAULT '',
  assigned_by_sales_name              TEXT DEFAULT '',
  assigned_pre_ops_id                 TEXT DEFAULT '',
  assigned_pre_ops_name               TEXT DEFAULT '',
  assigned_pre_ops_email              TEXT DEFAULT '',
  assigned_pre_ops_at                 TEXT DEFAULT '',
  assigned_ops                        TEXT DEFAULT '',
  assignment_mode                     TEXT DEFAULT '',
  pre_ops_status                      TEXT DEFAULT '',
  pre_ops_handover_acknowledged       INTEGER DEFAULT 0,
  pre_ops_handover_acknowledged_at    TEXT DEFAULT '',
  pre_ops_handover_acknowledged_by    TEXT DEFAULT '',
  post_ops_status                     TEXT DEFAULT '',
  post_op_stage                       TEXT DEFAULT '',
  sent_at                             TEXT DEFAULT '',
  sent_by                             TEXT DEFAULT '',
  sent_by_name                        TEXT DEFAULT '',
  fin_tcs                             REAL DEFAULT 0,
  extra                               TEXT DEFAULT '{}',
  created_at                          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                          TEXT
);
CREATE INDEX IF NOT EXISTS idx_itin_created_by         ON itineraries(created_by);
CREATE INDEX IF NOT EXISTS idx_itin_status             ON itineraries(status);
CREATE INDEX IF NOT EXISTS idx_itin_created_by_status  ON itineraries(created_by, status);
CREATE INDEX IF NOT EXISTS idx_itin_created_at         ON itineraries(created_at);
CREATE INDEX IF NOT EXISTS idx_itin_assigned_pre_ops   ON itineraries(assigned_pre_ops_id);

-- Itinerary subcollections (all use hybrid: key columns + JSON data)
CREATE TABLE IF NOT EXISTS itinerary_days (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  day_number    INTEGER DEFAULT 0,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_days_itin_id ON itinerary_days(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_hotels (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_hotels_itin_id ON itinerary_hotels(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_flights (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_flights_itin_id ON itinerary_flights(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_transfers (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_transfers_itin_id ON itinerary_transfers(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_activities (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_activities_itin_id ON itinerary_activities(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_pricing (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_pricing_itin_id ON itinerary_pricing(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_payments (
  id              TEXT PRIMARY KEY,
  itinerary_id    TEXT NOT NULL,
  amount          REAL DEFAULT 0,
  type            TEXT DEFAULT '',
  method          TEXT DEFAULT '',
  ref_number      TEXT DEFAULT '',
  collected_by    TEXT DEFAULT '',
  collected_by_name TEXT DEFAULT '',
  screenshot_url  TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  data            TEXT DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_payments_itin_id ON itinerary_payments(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_sop_checklist (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_sop_itin_id ON itinerary_sop_checklist(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_post_ops_checklist (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_postops_checklist_itin_id ON itinerary_post_ops_checklist(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_sales_checklist (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_sales_checklist_itin_id ON itinerary_sales_checklist(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_post_ops_data (
  itinerary_id  TEXT PRIMARY KEY,
  data          TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS itinerary_trip_notes (
  id            TEXT PRIMARY KEY,
  itinerary_id  TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itin_trip_notes_itin_id ON itinerary_trip_notes(itinerary_id);

-- ── Packages (template itineraries) ─────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id          TEXT PRIMARY KEY,
  name        TEXT DEFAULT '',
  destination TEXT DEFAULT '',
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS package_days (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_days_pkg_id ON package_days(package_id);

CREATE TABLE IF NOT EXISTS package_hotels (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_hotels_pkg_id ON package_hotels(package_id);

CREATE TABLE IF NOT EXISTS package_flights (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_flights_pkg_id ON package_flights(package_id);

CREATE TABLE IF NOT EXISTS package_transfers (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_transfers_pkg_id ON package_transfers(package_id);

CREATE TABLE IF NOT EXISTS package_activities (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_activities_pkg_id ON package_activities(package_id);

CREATE TABLE IF NOT EXISTS package_pricing (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pkg_pricing_pkg_id ON package_pricing(package_id);

-- ── Customers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  created_by      TEXT DEFAULT '',
  created_by_name TEXT DEFAULT '',
  data            TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_phone      ON customers(phone);

-- ── Drafts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drafts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);

-- ── SOPs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sops (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL DEFAULT '',
  department          TEXT NOT NULL DEFAULT '',
  items               TEXT NOT NULL DEFAULT '[]',
  whatsapp_template   TEXT DEFAULT '',
  stage               TEXT DEFAULT '',
  categories          TEXT DEFAULT '[]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sops_department ON sops(department);

-- ── Settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id    TEXT PRIMARY KEY,
  data  TEXT NOT NULL DEFAULT '{}'
);

-- ── Access Tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_tokens (
  id                  TEXT PRIMARY KEY,
  itinerary_id        TEXT NOT NULL,
  requested_by        TEXT NOT NULL DEFAULT '',
  requested_by_name   TEXT NOT NULL DEFAULT '',
  requested_by_role   TEXT NOT NULL DEFAULT '',
  reason              TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending',
  approved_by         TEXT DEFAULT '',
  approved_by_name    TEXT DEFAULT '',
  approved_at         TEXT DEFAULT '',
  expires_at          TEXT DEFAULT '',
  requested_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_access_tokens_itinerary_id ON access_tokens(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_status       ON access_tokens(status);
CREATE INDEX IF NOT EXISTS idx_access_tokens_requested_by ON access_tokens(requested_by);
