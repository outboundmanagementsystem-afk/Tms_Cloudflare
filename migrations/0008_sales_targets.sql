-- ============================================================
-- Outbound TMS — per-agent monthly sales targets
-- Migration: 0008_sales_targets  (applies to outbound-tms)
--
-- Backs "My Target"/leaderboard. One row per (agent, month). The table existed
-- ad-hoc on remote but had no migration; this makes a fresh DB self-sufficient.
-- IF NOT EXISTS keeps it safe to (re)apply against the existing remote DB.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_targets (
  agent_id   TEXT NOT NULL,             -- users.uid
  month      TEXT NOT NULL,             -- 'YYYY-MM' (IST)
  target     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, month)
);
CREATE INDEX IF NOT EXISTS idx_sales_targets_month ON sales_targets(month);
