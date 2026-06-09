// Lead Engine — Phase 2 follow-up cadence (PRD Module I).
// Cadence by temperature, channel rotation (WA→call→email), reply resets +
// advances, max attempts → Boomerang (not Lost). Re-engages after BOOMERANG_DAYS.

import { queryRows, queryOne, execute, newId } from "@/lib/db"
import { loadConfig, type LeadConfig } from "./config"

const nowISO = () => new Date().toISOString()
const addHoursISO = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

// Offsets in HOURS from the trigger, per temperature (PRD §FR-FUP-2).
const CADENCE: Record<string, number[]> = {
  hot: [4, 24, 48, 72, 96],     // same-day, then daily
  warm: [24, 72, 168, 336],     // +1d, +3d, +7d, +14d
  cold: [72, 168, 336],         // +3d, +7d, +14d
}
const CHANNELS = ["whatsapp", "call", "email"] // rotation (FR-FUP-3)

function messageFor(channel: string, lead: any): string {
  const who = lead.contactName || "there"
  const dest = lead.destination ? ` about ${lead.destination}` : ""
  if (channel === "whatsapp") return `Hi ${who}! Following up${dest} — shall I share a tailored plan & best price?`
  if (channel === "email") return `Hi ${who}, sharing options${dest}. Happy to refine to your dates & budget.`
  return `Call ${who}${dest} — qualify dates, pax, budget; offer to send a quote.`
}

/** Start (or restart) the cadence for a lead. Caps at MAX_FUP_ATTEMPTS. */
export async function startFollowup(db: D1Database, leadId: string, cfg?: LeadConfig) {
  cfg = cfg || (await loadConfig(db))
  const lead = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [leadId])
  if (!lead) return
  // Clear any pending steps, then schedule fresh.
  await execute(db, "UPDATE followup_tasks SET status='skipped' WHERE lead_id=? AND status='pending'", [leadId])
  const offsets = (CADENCE[lead.temperature] || CADENCE.cold).slice(0, cfg.MAX_FUP_ATTEMPTS)
  let step = 1
  for (const h of offsets) {
    const channel = CHANNELS[(step - 1) % CHANNELS.length]
    await execute(db,
      "INSERT INTO followup_tasks (id, lead_id, agent_id, step_no, channel, message, due_at, status, created_at) VALUES (?,?,?,?,?,?,?,'pending',datetime('now'))",
      [newId(), leadId, lead.ownerId || lead.owner_id || "", step, channel, messageFor(channel, lead), addHoursISO(h)])
    step++
  }
  await execute(db, "UPDATE leads SET state='in_followup', updated_at=datetime('now') WHERE id=? AND state IN ('working','in_followup')", [leadId])
}

/** Mark a follow-up step done (an attempt was made). Records a touch. */
export async function completeFollowupTask(db: D1Database, taskId: string, agentId: string) {
  const task = await queryOne<any>(db, "SELECT * FROM followup_tasks WHERE id=?", [taskId])
  if (!task) throw new Error("Task not found")
  await execute(db, "UPDATE followup_tasks SET status='done' WHERE id=?", [taskId])
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [newId(), task.leadId, agentId, task.channel === "call" ? "call" : task.channel, task.channel, "follow-up sent"])
  await execute(db, "UPDATE leads SET last_activity_at=datetime('now') WHERE id=?", [task.leadId])
  return { ok: true }
}

/** Customer replied → reset cadence, advance stage, treat as hot again (FR-FUP-5). */
export async function recordReply(db: D1Database, leadId: string, agentId: string, advanceStage?: string) {
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [newId(), leadId, agentId, "note", "inbound", "customer replied"])
  if (advanceStage) await execute(db, "UPDATE leads SET stage=? WHERE id=?", [advanceStage, leadId])
  await execute(db, "UPDATE leads SET temperature='hot', last_activity_at=datetime('now'), updated_at=datetime('now') WHERE id=?", [leadId])
  await startFollowup(db, leadId)
  return { ok: true }
}

/** Tick pass: max attempts → Boomerang; Boomerang re-entry after BOOMERANG_DAYS. */
export async function processFollowups(db: D1Database, cfg: LeadConfig) {
  let toBoomerang = 0, reEngaged = 0
  // Leads in follow-up with no pending steps left and >= MAX_FUP_ATTEMPTS done, no reply since.
  const exhausted = await queryRows<any>(db,
    `SELECT l.id,
        (SELECT COUNT(*) FROM followup_tasks f WHERE f.lead_id=l.id AND f.status='pending') AS pending,
        (SELECT COUNT(*) FROM followup_tasks f WHERE f.lead_id=l.id AND f.status='done') AS done
     FROM leads l WHERE l.state='in_followup'`)
  for (const e of exhausted) {
    if (e.pending === 0 && e.done >= cfg.MAX_FUP_ATTEMPTS) {
      await execute(db, "UPDATE leads SET state='boomerang', updated_at=datetime('now') WHERE id=?", [e.id])
      toBoomerang++
    }
  }
  // Re-engage boomerang leads after BOOMERANG_DAYS (FR-FUP-6).
  const wake = await queryRows<any>(db,
    "SELECT id FROM leads WHERE state='boomerang' AND updated_at <= datetime('now', ?)",
    [`-${cfg.BOOMERANG_DAYS} days`])
  for (const w of wake) {
    await execute(db, "UPDATE leads SET state='working', temperature='warm', updated_at=datetime('now') WHERE id=?", [w.id])
    await startFollowup(db, w.id, cfg)
    reEngaged++
  }
  return { toBoomerang, reEngaged }
}

/** Follow-up steps due now for an agent (for Today's Work). */
export async function followupsDue(db: D1Database, agentId: string) {
  return queryRows<any>(db,
    `SELECT f.id, f.lead_id AS leadId, f.channel, f.message, f.due_at AS dueAt, f.step_no AS stepNo,
            l.contact_name AS contactName, l.destination, l.temperature
     FROM followup_tasks f JOIN leads l ON l.id=f.lead_id
     WHERE f.agent_id=? AND f.status='pending' AND f.due_at <= datetime('now')
     ORDER BY f.due_at ASC LIMIT 50`, [agentId])
}
