-- ============================================================
-- Outbound One — "Booking Date Not Confirmed" (safe parts only)
-- Migration: 0004_booking_date  (applies to outbound-tms)
--
-- SAFE scope (per the stress-test Section F, bypass DEFERRED): a distinct funnel
-- stage for clients who committed to book but haven't fixed an exact travel date.
-- Mandatory estimated date (+ granularity), a sliding "lock the date" trigger that
-- becomes a durable recurring nudge, a single "date_confirmed" source of truth, and
-- an aging policy. The Sales-acting-as-Pre-Ops BYPASS is NOT built here.
-- Timestamps ISO-8601 TEXT (UTC); render IST.
-- ============================================================

ALTER TABLE leads ADD COLUMN estimated_date        TEXT;     -- anchored concrete day (YYYY-MM-DD)
ALTER TABLE leads ADD COLUMN estimated_granularity TEXT;     -- exact | early | mid | late (of month)
ALTER TABLE leads ADD COLUMN date_confirmed        INTEGER NOT NULL DEFAULT 0;  -- single source of truth
ALTER TABLE leads ADD COLUMN lock_due_at           TEXT;     -- when the "lock the date" nudge first fires
ALTER TABLE leads ADD COLUMN lock_nudge_count      INTEGER NOT NULL DEFAULT 0;  -- recurring nudges sent
ALTER TABLE leads ADD COLUMN lock_last_nudge_at    TEXT;     -- last nudge (cadence + dedupe)
ALTER TABLE leads ADD COLUMN date_unconfirmed_at   TEXT;     -- entered the bucket (age-in-stage KPI)
ALTER TABLE leads ADD COLUMN bdu_flagged           INTEGER NOT NULL DEFAULT 0;  -- aging: flagged for re-qualify/archive

CREATE INDEX IF NOT EXISTS idx_leads_lockdue ON leads(stage, date_confirmed, lock_due_at);

-- Config for the safe build.
INSERT OR IGNORE INTO lead_config (key, value) VALUES
  ('LOCK_NUDGE_INTERVAL_H','24'),     -- hours between recurring "lock the date" nudges
  ('LOCK_NUDGE_MAX','5'),             -- nudges before aging flag (re-qualify/archive)
  ('PREOPS_MIN_DAYS','7');            -- min runway Pre-Ops needs; below this → expedite warning
