-- ============================================================
-- Outbound One — CRM (SalesFlow) alignment
-- Migration: 0002_crm_leads  (applies to outbound-tms)
--
-- Additive only. Extends the existing `leads` table with the CRM lead fields
-- (channel/country/pax/budget text/meeting+follow-up times/interested-sub/
-- lost-reason/booked-value) so the "All Leads" 13-stage Kanban + lead drawer
-- read/write real D1. Adds `lead_documents` for the drawer's Document tab,
-- stored in the existing `outbound-files` R2 bucket. No seed data.
-- All timestamps ISO-8601 TEXT (UTC); the app renders IST.
-- ============================================================

-- ─── CRM fields on the existing leads table ─────────────────────
ALTER TABLE leads ADD COLUMN email          TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN country        TEXT DEFAULT '';     -- AE|IN|SA|OM|US|QA (dial-code group)
ALTER TABLE leads ADD COLUMN pax            INTEGER DEFAULT 1;
ALTER TABLE leads ADD COLUMN budget_text    TEXT DEFAULT '';     -- free-text budget incl. currency (AED 14,000)
ALTER TABLE leads ADD COLUMN follow_up_at   TEXT;                -- next follow-up (denormalized for the board)
ALTER TABLE leads ADD COLUMN meeting_at     TEXT;                -- scheduled meeting time
ALTER TABLE leads ADD COLUMN interested_sub TEXT;               -- Qualified|Interested to Buy|Maybe Later|Schedule Meeting|Token
ALTER TABLE leads ADD COLUMN lost_reason    TEXT;
ALTER TABLE leads ADD COLUMN dnd_reason     TEXT;
ALTER TABLE leads ADD COLUMN booked_value   TEXT DEFAULT '';     -- value on WON
ALTER TABLE leads ADD COLUMN attempts       INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_owner_stage ON leads(owner_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_followup    ON leads(owner_id, follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_meeting     ON leads(owner_id, meeting_at);

-- ─── Lead documents (R2-backed, per lead) ───────────────────────
CREATE TABLE IF NOT EXISTS lead_documents (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT NOT NULL,
  owner_id     TEXT,                                -- salesperson uid (scoping)
  name         TEXT NOT NULL,                       -- original filename
  r2_key       TEXT NOT NULL,                       -- key in outbound-files
  size         INTEGER NOT NULL DEFAULT 0,
  content_type TEXT DEFAULT 'application/octet-stream',
  uploaded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaddoc_lead  ON lead_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_leaddoc_owner ON lead_documents(owner_id);
