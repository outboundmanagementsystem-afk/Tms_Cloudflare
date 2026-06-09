// "Booking Date Not Confirmed" — SAFE build (the stress-test Section F fixes;
// the Sales-acting-as-Pre-Ops bypass is DEFERRED until §H is decided).
//
// A client has committed to book but not fixed an exact travel date. We:
//  - require a concrete estimated date (+ granularity) — anchor all triggers to a day (A1/A10)
//  - compute a sliding "lock the date" trigger from the table below (Section 0)
//  - turn it into a DURABLE recurring nudge (not a single fire) + aging policy (A5/F3/F9)
//  - keep ONE date_confirmed flag as the source of truth (A9/C7)
//  - warn (not bypass) when confirmation lands inside the Pre-Ops minimum runway (F4/A2)
//
// Date math uses explicit ms arithmetic on UTC-midnight dates to avoid the fragile
// month/Feb drift the spec calls out (A8).

import { queryRows, queryOne, execute, newId, now } from "@/lib/db"
import { loadConfig, type LeadConfig } from "@/lib/lead-engine/config"

const DAY = 86_400_000
const UNCONFIRMED = "BOOKING_DATE_UNCONFIRMED"

function dayMs(d: string): number { return Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) }
function todayMs(): number { const ist = new Date(Date.now() + 330 * 60_000); return dayMs(ist.toISOString()) }

/**
 * Sliding "lock the date" lead time (days before the estimated date the nudge fires),
 * per the spec table — with the A4 gaps filled: far-future (>5mo) still nurtures at 45d,
 * same-week/walk-up (≤3d out) locks immediately.
 */
export function lockLeadTimeDays(daysUntil: number): number {
  if (daysUntil >= 75) return 45   // 3–5+ months (and far-future)
  if (daysUntil >= 45) return 30   // ~2 months
  if (daysUntil >= 24) return 15   // ~1 month
  if (daysUntil >= 17) return 10   // ~3 weeks
  if (daysUntil >= 10) return 7    // ~2 weeks
  if (daysUntil >= 4) return 3     // ~1 week
  return 0                          // same-week / walk-up → lock now
}

/** Compute the lock-due day. If already inside the window at creation (A3) → due now. */
function computeLockDueAt(estimatedDate: string): string {
  const est = dayMs(estimatedDate)
  const daysUntil = Math.floor((est - todayMs()) / DAY)
  const lead = lockLeadTimeDays(daysUntil)
  const due = est - lead * DAY
  return new Date(Math.max(due, Date.now())).toISOString()
}

async function logEvent(db: D1Database, leadId: string, agentId: string, type: string, detail: string) {
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,'',datetime('now'))",
    [newId(), leadId, agentId, type, detail])
}

// ─── Enter the bucket (mandatory estimated date; recompute on change — A6) ──
export async function enterDateUnconfirmed(db: D1Database, id: string, ownerId: string, estimatedDate: string, granularity = "exact") {
  const lead = await queryOne<any>(db, "SELECT id FROM leads WHERE id=? AND owner_id=?", [id, ownerId])
  if (!lead) return null
  // Validate a concrete date in the future (F2/A3/D).
  const est = dayMs(estimatedDate)
  if (!est || isNaN(est)) return { error: "A valid estimated date is required." }
  if (est < todayMs()) return { error: "Estimated date must be in the future." }

  const lockDue = computeLockDueAt(estimatedDate)
  await execute(db,
    `UPDATE leads SET stage=?, estimated_date=?, estimated_granularity=?, date_confirmed=0,
        lock_due_at=?, lock_nudge_count=0, lock_last_nudge_at=NULL, bdu_flagged=0,
        date_unconfirmed_at=COALESCE(date_unconfirmed_at, datetime('now')),
        last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`,
    [UNCONFIRMED, estimatedDate.slice(0, 10), granularity, lockDue, id])
  await logEvent(db, id, ownerId, "status_change", `Booking date unconfirmed — est ${estimatedDate.slice(0, 10)} (${granularity}); lock-by ${lockDue.slice(0, 10)}`)
  return { ok: true, lockDueAt: lockDue }
}

// ─── Confirm the real travel date — the single source of truth (A9/F5) ──
export async function confirmTravelDate(db: D1Database, id: string, ownerId: string, exactDate: string) {
  const lead = await queryOne<any>(db, "SELECT id FROM leads WHERE id=? AND owner_id=?", [id, ownerId])
  if (!lead) return null
  const ms = dayMs(exactDate)
  if (!ms || isNaN(ms)) return { error: "A valid travel date is required." }
  if (ms < todayMs()) return { error: "Travel date must be in the future." }

  const cfg = await loadConfig(db)
  const runwayDays = Math.floor((ms - todayMs()) / DAY)
  // F4/A2: never silently let the runway drop below the Pre-Ops minimum. We flag an
  // expedite warning (Pre-Ops first) — we DO NOT auto-bypass (that's deferred).
  const expedite = runwayDays < cfg.PREOPS_MIN_DAYS

  await execute(db,
    `UPDATE leads SET date_confirmed=1, travel_date=?, stage='WON', state='won',
        lock_due_at=NULL, bdu_flagged=0, last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`,
    [exactDate.slice(0, 10), id])
  await logEvent(db, id, ownerId, "status_change", `Travel date confirmed: ${exactDate.slice(0, 10)} (runway ${runwayDays}d)${expedite ? " — EXPEDITE: inside Pre-Ops minimum" : ""}`)
  // Stop any follow-up cadence (it's booked).
  await execute(db, "UPDATE followup_tasks SET status='skipped' WHERE lead_id=? AND status='pending'", [id])
  return { ok: true, runwayDays, expedite, preOpsMinDays: cfg.PREOPS_MIN_DAYS }
}

// ─── Tick: durable recurring nudge + aging (F3/F5/F9/A5) ──
export async function processDateLocks(db: D1Database, cfg: LeadConfig) {
  const res = { lock_nudges: 0, lock_flagged: 0 }
  const rows = await queryRows<any>(db,
    `SELECT id, owner_id, estimated_date, lock_due_at, lock_nudge_count, lock_last_nudge_at, bdu_flagged
       FROM leads WHERE stage=? AND date_confirmed=0`, [UNCONFIRMED])
  const nowMs = Date.now()
  for (const l of rows) {
    // Aging: estimated date passed OR too many nudges → flag for re-qualify/archive (don't delete).
    const estPassed = l.estimatedDate && dayMs(l.estimatedDate) < todayMs()
    if (!l.bduFlagged && (estPassed || (l.lockNudgeCount ?? 0) >= cfg.LOCK_NUDGE_MAX)) {
      await execute(db, "UPDATE leads SET bdu_flagged=1, updated_at=datetime('now') WHERE id=?", [l.id])
      await logEvent(db, l.id, l.ownerId, "note", estPassed ? "Estimated date passed — flagged to re-qualify/archive" : "Max lock-date nudges reached — flagged to re-qualify")
      res.lock_flagged++
      continue
    }
    if (l.bduFlagged) continue
    // Durable recurring nudge once we're past lock-due.
    if (l.lockDueAt && nowMs >= new Date(l.lockDueAt).getTime()) {
      const sinceLast = l.lockLastNudgeAt ? (nowMs - new Date(l.lockLastNudgeAt).getTime()) / 3_600_000 : Infinity
      if (sinceLast >= cfg.LOCK_NUDGE_INTERVAL_H) {
        await execute(db,
          "UPDATE leads SET lock_nudge_count=lock_nudge_count+1, lock_last_nudge_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
          [l.id])
        await logEvent(db, l.id, l.ownerId, "followup_scheduled", `Lock the travel date — nudge #${(l.lockNudgeCount ?? 0) + 1} (est ${l.estimatedDate})`)
        res.lock_nudges++
      }
    }
  }
  return res
}

// ─── "Dates to lock today" for an owner (Today's Work lane / drawer) ──
export async function datesToLock(db: D1Database, ownerId: string) {
  const rows = await queryRows<any>(db,
    `SELECT id, contact_name AS name, destination, estimated_date, estimated_granularity,
            lock_due_at, lock_nudge_count, bdu_flagged, date_unconfirmed_at
       FROM leads WHERE owner_id=? AND stage=? AND date_confirmed=0
       ORDER BY lock_due_at ASC`, [ownerId, UNCONFIRMED])
  const nowMs = Date.now()
  return rows.map((r: any) => ({
    id: r.id, name: r.name || "Lead", destination: r.destination || "",
    estimatedDate: r.estimatedDate, granularity: r.estimatedGranularity,
    lockDueAt: r.lockDueAt, nudges: r.lockNudgeCount || 0, flagged: !!r.bduFlagged,
    due: r.lockDueAt ? nowMs >= new Date(r.lockDueAt).getTime() : false,
    ageDays: r.dateUnconfirmedAt ? Math.floor((nowMs - new Date(r.dateUnconfirmedAt).getTime()) / DAY) : 0,
  }))
}
