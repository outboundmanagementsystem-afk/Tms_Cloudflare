// Lead Engine — agent roster, eligibility & round-robin.
// Extracted from engine.ts so both engine.ts (assignment) and quotes.ts (Module N
// transfer) can use them WITHOUT a circular import (engine ⇄ quotes).

import { queryRows, queryOne, execute } from "@/lib/db"
import { type LeadConfig } from "./config"

/** WIP = untouched assigned leads + open pending quotes (FR-QUOTE-11). active = in flight. */
export async function agentMetrics(db: D1Database, agentId: string) {
  const row = await queryOne<{ wip: number; pq: number; active: number }>(db,
    `SELECT
       SUM(CASE WHEN state='assigned' THEN 1 ELSE 0 END) AS wip,
       SUM(CASE WHEN quote_sla_started_at IS NOT NULL AND quote_sent_at IS NULL THEN 1 ELSE 0 END) AS pq,
       SUM(CASE WHEN state IN ('assigned','working','in_followup') THEN 1 ELSE 0 END) AS active
     FROM leads WHERE owner_id = ?`, [agentId])
  return { wip: (row?.wip ?? 0) + (row?.pq ?? 0), active: row?.active ?? 0 }
}

/** Sales agents (sales + sales_lead) in a stable order for round-robin. */
export async function salesAgents(db: D1Database) {
  return queryRows<{ uid: string; name: string; role: string }>(db,
    "SELECT uid, name, role FROM users WHERE role IN ('sales','sales_lead') AND COALESCE(disabled,0)=0  AND COALESCE(inactive,0)=0 ORDER BY created_at, uid")
}

export async function presenceMap(db: D1Database) {
  const rows = await queryRows<{ agentId: string; availability: string; hoardBlocked: number }>(db,
    "SELECT agent_id, availability, COALESCE(hoard_blocked,0) AS hoard_blocked FROM agent_presence")
  const m = new Map<string, { availability: string; hoardBlocked: number }>()
  for (const r of rows) m.set(r.agentId, { availability: r.availability, hoardBlocked: r.hoardBlocked })
  return m
}

/** Eligible = sales, online, under WIP cap, not hoard-blocked. Returns ordered uids. */
export async function eligibleAgents(db: D1Database, cfg: LeadConfig, skip: string[] = []): Promise<string[]> {
  const agents = await salesAgents(db)
  const pres = await presenceMap(db)
  const out: string[] = []
  for (const a of agents) {
    if (skip.includes(a.uid)) continue
    const p = pres.get(a.uid)
    if (!p || p.availability !== "online") continue
    const { wip, active } = await agentMetrics(db, a.uid)
    if (wip >= cfg.LIVE_WIP) continue
    if (p.hoardBlocked || active >= cfg.HOARD_STOP) continue
    out.push(a.uid)
  }
  return out
}

export async function getCfgNum(db: D1Database, key: string): Promise<number> {
  const r = await queryOne<{ value: string }>(db, "SELECT value FROM lead_config WHERE key=?", [key])
  return Number(r?.value ?? 0)
}
export async function setCfg(db: D1Database, key: string, value: string) {
  await execute(db, "INSERT INTO lead_config (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')", [key, value])
}

/** Round-robin pick over eligible agents using a persisted pointer (FR-LIVE-3). */
export async function pickRoundRobin(db: D1Database, eligible: string[]): Promise<string | null> {
  if (!eligible.length) return null
  const ptr = await getCfgNum(db, "RR_POINTER")
  const idx = ptr % eligible.length
  const chosen = eligible[idx]
  await setCfg(db, "RR_POINTER", String((idx + 1) % Math.max(eligible.length, 1)))
  return chosen
}
