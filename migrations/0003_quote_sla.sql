-- ============================================================
-- Outbound One — Lead Engine · Module N: Pending Quotes SLA (PRD v1.1)
-- Migration: 0003_quote_sla  (applies to outbound-tms)
--
-- Additive only. The quote SLA clock starts when a lead enters `Pending Quotes`
-- and stops ONLY when the quote is actually sent (dispatched + logged) → Quote Given.
-- All quote timers are WORKING-HOURS-AWARE: elapsed is measured in working minutes,
-- so off-hours automatically pauses them. Timestamps ISO-8601 TEXT (UTC); render IST.
-- ============================================================

-- ─── Quote-timer fields on the existing leads table ─────────────
ALTER TABLE leads ADD COLUMN quote_sla_started_at  TEXT;            -- when entered Pending Quotes (clock anchor)
ALTER TABLE leads ADD COLUMN quote_due_at          TEXT;            -- informational deadline (display)
ALTER TABLE leads ADD COLUMN quote_sent_at         TEXT;            -- the ONLY stop event
ALTER TABLE leads ADD COLUMN quote_transfers       INTEGER NOT NULL DEFAULT 0;  -- peer transfers used
ALTER TABLE leads ADD COLUMN quote_breached        INTEGER NOT NULL DEFAULT 0;  -- banger fired
ALTER TABLE leads ADD COLUMN quote_last_reminder_at TEXT;           -- last 5-min reminder
ALTER TABLE leads ADD COLUMN quote_prealert_sent   INTEGER NOT NULL DEFAULT 0;  -- 60-min manager pre-alert sent
ALTER TABLE leads ADD COLUMN quote_acked_at        TEXT;            -- owner acknowledged (quiets popup, not the clock)

CREATE INDEX IF NOT EXISTS idx_leads_quote_open ON leads(quote_sla_started_at, quote_sent_at);

-- ─── Quotes (the priced itinerary/proposal; send is the stop event) ──
CREATE TABLE IF NOT EXISTS quotes (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL,
  agent_id   TEXT NOT NULL,                       -- who built/sent it
  status     TEXT NOT NULL DEFAULT 'draft',       -- draft | sent | send_failed
  channel    TEXT DEFAULT 'whatsapp',             -- whatsapp | email
  doc_ref    TEXT DEFAULT '',                     -- itinerary/quote document reference
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at    TEXT                                 -- set only on successful dispatch
);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);

-- ─── Module N config (PRD §11 defaults) ─────────────────────────
INSERT OR IGNORE INTO lead_config (key, value) VALUES
  ('QUOTE_SLA','30'),                 -- min to send the quote
  ('QUOTE_REMINDER_INTERVAL','5'),    -- reminder cadence after breach
  ('QUOTE_MANAGER_PREALERT','60'),    -- manager pre-alert
  ('QUOTE_HARD_LIMIT','120'),         -- auto-transfer
  ('QUOTE_OFFLINE_GRACE','5'),        -- grace before offline transfer
  ('QUOTE_TRANSFER_CAP','1');         -- peer transfers before manager
