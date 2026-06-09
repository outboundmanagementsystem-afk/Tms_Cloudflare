// Role-based Target Dashboard (Salesperson / Team Lead / Sales Manager).
// Targets live per-agent in `sales_targets` (a salesperson's row = their goal; a
// team-lead's row = the team total the manager assigned). Achieved revenue comes
// from confirmed itineraries (sellPrice), bucketed into the month's 4 weeks (IST).
//
// Hierarchy: Manager sets/splits team totals → Team Lead splits to members →
// Salesperson sees their own (read-only). Teams are defined by users.lead_id.

import { queryRows, queryOne } from "@/lib/db"
import { CLOSED, istMonth, sellPrice } from "@/lib/sales-target"

export type Meta = {
  daysInMonth: number; today: number; monthLabel: string; month: string
  weekDefs: { n: number; range: string; start: number; end: number }[]
  cur: number; dayInWk: number; wkDays: number; monthElapsed: number; wkElapsed: number; daysLeft: number
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function monthMeta(): Meta {
  const ist = new Date(Date.now() + 330 * 60_000)
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const today = ist.getUTCDate()
  const ms = MONTHS_SHORT[m]
  const weekDefs = [
    { n: 1, start: 1, end: 7 }, { n: 2, start: 8, end: 14 },
    { n: 3, start: 15, end: 21 }, { n: 4, start: 22, end: daysInMonth },
  ].map((w) => ({ ...w, range: `${ms} ${w.start} – ${w.end}` }))
  const cur = today <= 7 ? 1 : today <= 14 ? 2 : today <= 21 ? 3 : 4
  const cw = weekDefs[cur - 1]
  const dayInWk = today - cw.start + 1
  const wkDays = cw.end - cw.start + 1
  return {
    daysInMonth, today, month: istMonth(),
    monthLabel: ist.toLocaleString("en-US", { month: "long" }) + " " + y,
    weekDefs, cur, dayInWk, wkDays,
    monthElapsed: Math.round((today / daysInMonth) * 100),
    wkElapsed: Math.round((dayInWk / wkDays) * 100),
    daysLeft: daysInMonth - today,
  }
}

function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/)
  return (((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase()) || "?"
}
function istDay(iso: string): number {
  return new Date(new Date(iso).getTime() + 330 * 60_000).getUTCDate()
}
function weekIndex(day: number): number {
  return day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
}

// Bulk: this-month achieved revenue per agent, split into the 4 week buckets.
async function achievedWeekly(db: D1Database, agentIds: string[], meta: Meta): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (const id of agentIds) map.set(id, [0, 0, 0, 0])
  if (!agentIds.length) return map
  const sph = CLOSED.map(() => "?").join(",")
  const aph = agentIds.map(() => "?").join(",")
  const rows = await queryRows<any>(db,
    `SELECT * FROM itineraries
      WHERE created_by IN (${aph}) AND status IN (${sph})
        AND strftime('%Y-%m', created_at, '+330 minutes') = ?`,
    [...agentIds, ...CLOSED, meta.month])
  for (const it of rows) {
    const owner = it.createdBy || it.created_by
    const arr = map.get(owner); if (!arr) continue
    arr[weekIndex(istDay(it.createdAt || it.created_at))] += sellPrice(it)
  }
  return map
}

// Bulk: this-month target per agent.
async function targetsFor(db: D1Database, agentIds: string[], meta: Meta): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!agentIds.length) return map
  const aph = agentIds.map(() => "?").join(",")
  const rows = await queryRows<any>(db,
    `SELECT agent_id, target FROM sales_targets WHERE month=? AND agent_id IN (${aph})`,
    [meta.month, ...agentIds])
  for (const r of rows) map.set(r.agentId, Number(r.target) || 0)
  return map
}

function personOf(u: any, ach: Map<string, number[]>, tgt: Map<string, number>) {
  return {
    uid: u.uid, name: u.name || "—", short: initials(u.name), role: u.role,
    team: u.department || (u.role === "sales_lead" ? "Team Lead" : "Sales"),
    target: tgt.get(u.uid) || 0,
    wk: ach.get(u.uid) || [0, 0, 0, 0],
  }
}
const aggWk = (arrs: number[][]) => [0, 1, 2, 3].map((i) => arrs.reduce((s, a) => s + (a[i] || 0), 0))

async function salesUsers(db: D1Database) {
  return queryRows<any>(db,
    `SELECT uid, name, role, department, lead_id FROM users
      WHERE role IN ('sales','sales_lead') AND COALESCE(disabled,0)=0 AND COALESCE(inactive,0)=0
      ORDER BY name`)
}

// ─── The role-based dashboard payload ───────────────────────────
export async function dashboardData(db: D1Database, agent: { uid: string; name: string; role: string }) {
  const meta = monthMeta()
  const role = agent.role

  // Salesperson — own card only.
  if (role === "sales") {
    const ach = await achievedWeekly(db, [agent.uid], meta)
    const tgt = await targetsFor(db, [agent.uid], meta)
    const me = await queryOne<any>(db, "SELECT uid, name, role, department, lead_id FROM users WHERE uid=?", [agent.uid])
    const entity = personOf(me || { uid: agent.uid, name: agent.name, role }, ach, tgt)
    return { view: "sp", canSet: false, meta, id: identity(entity, "Salesperson"), entity }
  }

  // Team Lead — their team (members where lead_id = me), they split member targets.
  if (role === "sales_lead") {
    const all = await salesUsers(db)
    const members = all.filter((u) => u.leadId === agent.uid)
    const ids = members.map((m) => m.uid).concat(agent.uid)
    const ach = await achievedWeekly(db, ids, meta)
    const tgt = await targetsFor(db, ids, meta)
    const memEntities = members.map((m) => personOf(m, ach, tgt))
    const teamTotal = (tgt.get(agent.uid) || 0) || memEntities.reduce((s, m) => s + m.target, 0)
    const entity = {
      name: agent.name, short: initials(agent.name), team: "My Team",
      target: teamTotal, wk: aggWk(memEntities.map((m) => m.wk)), members: memEntities,
    }
    return { view: "tl", canSet: true, meta, id: identity(entity, "Team Lead"), entity }
  }

  // Manager (admin/owner) — every team grouped by lead, plus unassigned reps.
  const all = await salesUsers(db)
  const ids = all.map((u) => u.uid)
  const ach = await achievedWeekly(db, ids, meta)
  const tgt = await targetsFor(db, ids, meta)

  const leads = all.filter((u) => u.role === "sales_lead")
  const leadSet = new Set(leads.map((l) => l.uid))

  const teams: any[] = []
  for (const L of leads) {
    const mem = all.filter((u) => u.role !== "sales_lead" && u.leadId === L.uid).map((m) => personOf(m, ach, tgt))
    const target = (tgt.get(L.uid) || 0) || mem.reduce((s, m) => s + m.target, 0)
    teams.push({
      name: L.name, short: initials(L.name), team: L.department || "Team", leadUid: L.uid,
      target, wk: aggWk(mem.map((m) => m.wk)), members: mem,
    })
  }
  // Every non-lead rep not in a valid team (no lead, or lead_id that isn't a real lead).
  const orphans = all.filter((u) => u.role !== "sales_lead" && !leadSet.has(u.leadId)).map((m) => personOf(m, ach, tgt))
  if (orphans.length) {
    teams.push({
      name: "Unassigned", short: "—", team: "No team lead", leadUid: null,
      target: orphans.reduce((s, m) => s + m.target, 0), wk: aggWk(orphans.map((m) => m.wk)), members: orphans,
    })
  }

  const entity = {
    name: "Organisation", short: "OG", team: "Organisation",
    target: teams.reduce((s, t) => s + t.target, 0), wk: aggWk(teams.map((t) => t.wk)), teams,
  }
  return { view: "mgr", canSet: true, meta, id: identity(entity, "Sales Manager"), entity }
}

function identity(entity: any, roleLabel: string) {
  return {
    name: entity.name, short: entity.short, role: roleLabel,
    scope: entity.team || "Sales",
  }
}
