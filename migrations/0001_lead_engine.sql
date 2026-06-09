-- ============================================================
-- Outbound One — Lead Engine (PRD v1.0)
-- Migration: 0001_lead_engine  (applies to outbound-tms)
--
-- Additive only. New tables for the lead assignment / SLA / follow-up engine
-- surfaced on the TMS salesperson "Today's Work" page. No existing TMS table is
-- touched. All timestamps are stored as ISO-8601 TEXT in UTC; the app renders IST.
-- ============================================================

-- ─── Leads (the inbound enquiry) ────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL,                 -- instagram|facebook|whatsapp|tiktok|google|youtube|direct
  contact_name       TEXT DEFAULT '',
  phone              TEXT DEFAULT '',               -- E.164 where possible
  handle             TEXT DEFAULT '',               -- social handle / IG username
  destination        TEXT DEFAULT '',
  travel_date        TEXT,                          -- ISO date, nullable
  budget             INTEGER,                       -- INR, nullable
  trip_type          TEXT DEFAULT '',               -- family|honeymoon|group|solo|business|adventure|luxury
  score              INTEGER NOT NULL DEFAULT 0,
  score_breakdown    TEXT DEFAULT '{}',             -- JSON of {criterion: points}
  temperature        TEXT NOT NULL DEFAULT 'cold',  -- hot|warm|cold
  state              TEXT NOT NULL DEFAULT 'captured', -- captured|pooled|assigned|working|in_followup|won|lost|boomerang
  stage              TEXT NOT NULL DEFAULT 'New',   -- existing CRM stages
  owner_id           TEXT,                          -- users.uid (TMS), nullable
  captured_at        TEXT NOT NULL DEFAULT (datetime('now')),
  pooled_at          TEXT,
  auto_reply_sent_at TEXT,
  first_touch_at     TEXT,
  last_activity_at   TEXT,
  miss_count         INTEGER NOT NULL DEFAULT 0,    -- reassignment misses
  is_repeat          INTEGER NOT NULL DEFAULT 0,
  raw_payload        TEXT DEFAULT '{}',             -- original webhook payload (audit)
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_state       ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_owner       ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_pool        ON leads(state, captured_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone       ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);

-- ─── Assignments (SLA anchor) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_assignments (
  id             TEXT PRIMARY KEY,
  lead_id        TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  assigned_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sla_due_at     TEXT NOT NULL,                     -- assigned_at + SLA(temperature)
  channel_origin TEXT NOT NULL DEFAULT 'live_roundrobin', -- morning_batch|live_roundrobin|presales_handoff|backfill|manual
  outcome        TEXT,                              -- touched|reassigned|escalated|returned_to_pool (null = open)
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assign_lead  ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_assign_agent ON lead_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_assign_open  ON lead_assignments(outcome, sla_due_at);

-- ─── Touch events (immutable audit) ─────────────────────────────
CREATE TABLE IF NOT EXISTS touch_events (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL,
  agent_id   TEXT NOT NULL,
  type       TEXT NOT NULL,                         -- call|whatsapp|email|note|followup_scheduled|status_change
  channel    TEXT DEFAULT '',
  detail     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_touch_lead  ON touch_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_touch_agent ON touch_events(agent_id);

-- ─── Follow-up tasks (cadence) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_tasks (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  step_no     INTEGER NOT NULL DEFAULT 1,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',     -- whatsapp|call|email
  template_id TEXT,                                 -- TMS SOP template id
  message     TEXT DEFAULT '',                      -- pre-filled message
  due_at      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',      -- pending|done|skipped
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fup_lead ON followup_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_fup_due  ON followup_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_fup_agent ON followup_tasks(agent_id, status, due_at);

-- ─── Escalations (manager queue) ────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL,
  from_agent_id TEXT,
  reason        TEXT NOT NULL,                       -- bounce_cap|morning_deadline|hot_timeout
  detail        TEXT DEFAULT '',
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_esc_open ON escalations(resolved, created_at);

-- ─── Engine config (the §11 parameters, editable) ───────────────
CREATE TABLE IF NOT EXISTS lead_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO lead_config (key, value) VALUES
  ('WORK_START','09:00'), ('WORK_END','18:00'), ('ASSIGN_CUTOFF','17:30'),
  ('MORNING_BATCH_SIZE','3'), ('MORNING_DEADLINE','11:00'),
  ('LIVE_WIP','2'), ('SLA_HOT','5'), ('SLA_WARM','15'), ('SLA_COLD','30'),
  ('MAX_MISSES','3'), ('PRESALES_CAP','10'),
  ('HOT_THRESHOLD','80'), ('HOT_ALERT_MIN','5'),
  ('MAX_FUP_ATTEMPTS','6'), ('BOOMERANG_DAYS','30'),
  ('HOARD_STOP','100'), ('HOARD_RESUME','80'),
  ('MORNING_ALLOC','auto'),           -- D1: auto | constrained
  ('MORNING_DEADLINE_TYPE','clock');  -- D3: clock | duration

-- ─── Agent presence (sales availability for assignment) ─────────
-- TMS users already exist; this tracks live availability for the engine.
CREATE TABLE IF NOT EXISTS agent_presence (
  agent_id     TEXT PRIMARY KEY,
  availability  TEXT NOT NULL DEFAULT 'offline',     -- online|offline|break|leave|meeting
  last_login_at TEXT,
  last_seen_at  TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Round-robin pointer (persists rotation across restarts) ─────
INSERT OR IGNORE INTO lead_config (key, value) VALUES ('RR_POINTER','0');
