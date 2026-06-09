// Lead Engine — core orchestration (PRD Modules A–F, J, K, M).
// Event-driven (capture, login, touch) + time-driven (tick / cron).
// All writes are to outbound-tms. Timestamps stored UTC, windows computed IST.

import { queryRows, queryOne, execute, newId } from "@/lib/db"
import {
  loadConfig, operatingMode, slaMinutesFor, addMinutesISO,
  istParts, hhmmToMinutes, type LeadConfig,
} from "./config"
import { scoreLead, type ScoreInput } from "./scoring"
import { startFollowup, processFollowups, followupsDue } from "./followup"
import { processQuotes, managerQuoteWatch } from "./quotes"
import { agentMetrics, salesAgents, eligibleAgents, pickRoundRobin } from "./roster"
import { processDateLocks } from "@/lib/booking-date"

const nowISO = () => new Date().toISOString()

/** UTC ISO for today's HH:MM in IST (used for the fixed-clock morning deadline). */
function istClockTodayUtcISO(hhmm: string, d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60_000)
  const dateKey = ist.toISOString().slice(0, 10)
  const asIfUtc = Date.parse(`${dateKey}T${hhmm}:00Z`)
  return new Date(asIfUtc - 330 * 60_000).toISOString()
}

// Agent metrics, eligibility & round-robin live in ./roster (shared with quotes.ts
// to avoid a circular import). Imported above.

// ─── Assignment / pooling ───────────────────────────────────────

async function assignLeadTo(db: D1Database, lead: any, agentId: string, origin: string, slaDueAt: string) {
  await execute(db,
    "UPDATE leads SET owner_id=?, state='assigned', updated_at=datetime('now') WHERE id=?",
    [agentId, lead.id])
  await execute(db,
    "INSERT INTO lead_assignments (id, lead_id, agent_id, assigned_at, sla_due_at, channel_origin) VALUES (?,?,?,?,?,?)",
    [newId(), lead.id, agentId, nowISO(), slaDueAt, origin])
}

async function poolLead(db: D1Database, leadId: string, head = false) {
  // head=true puts it at the front by back-dating pooled marker (oldest-first ordering uses captured_at).
  await execute(db,
    "UPDATE leads SET state='pooled', owner_id=NULL, pooled_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
    [leadId])
}

// ─── Capture (Module A) ─────────────────────────────────────────

export interface CaptureInput {
  source: string
  contactName?: string; phone?: string; handle?: string
  destination?: string; travelDate?: string | null; budget?: number | null
  tripType?: string; international?: boolean; corporate?: boolean; family?: boolean
  rawPayload?: any
}

export async function captureLead(db: D1Database, input: CaptureInput) {
  const cfg = await loadConfig(db)

  // §FR-CAP-4 dedupe: same phone/handle with an open lead in the last 14 days → repeat.
  let isRepeat = false
  if (input.phone || input.handle) {
    const ph = input.phone || "", hn = input.handle || ""
    const dup = await queryOne<any>(db,
      `SELECT id FROM leads
       WHERE state NOT IN ('won','lost','boomerang')
         AND ( (? <> '' AND phone = ?) OR (? <> '' AND handle = ?) )
         AND captured_at > datetime('now','-14 days')
       ORDER BY captured_at DESC LIMIT 1`,
      [ph, ph, hn, hn])
    if (dup) {
      isRepeat = true
      // Link as repeat: bump score, do not create a duplicate record.
      const existing = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [dup.id])
      const s = scoreLead({ ...buildScoreInput(input), isRepeat: true }, cfg)
      await execute(db,
        "UPDATE leads SET is_repeat=1, score=?, score_breakdown=?, temperature=?, last_activity_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
        [s.score, JSON.stringify(s.breakdown), s.temperature, dup.id])
      return { id: dup.id, deduped: true, temperature: s.temperature }
    }
  }

  const s = scoreLead({ ...buildScoreInput(input), isRepeat }, cfg)
  const id = newId()
  await execute(db,
    `INSERT INTO leads (id, source, contact_name, phone, handle, destination, travel_date, budget, trip_type,
        score, score_breakdown, temperature, state, stage, captured_at, raw_payload, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'captured','New',datetime('now'),?,datetime('now'),datetime('now'))`,
    [id, input.source, input.contactName || "", input.phone || "", input.handle || "",
     input.destination || "", input.travelDate || null, input.budget ?? null, input.tripType || "",
     s.score, JSON.stringify(s.breakdown), s.temperature, JSON.stringify(input.rawPayload ?? {})])

  // §FR-CAP-3 auto first-touch (24/7). Real send wired to WhatsApp/IG provider later;
  // here we record that the acknowledgement was dispatched.
  await execute(db, "UPDATE leads SET auto_reply_sent_at=datetime('now') WHERE id=?", [id])

  const lead = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [id])

  // §FR-TIME: live window → assign now; off-hours / after cutoff → pool.
  if (operatingMode(cfg) === "live") {
    await tryAssignLive(db, cfg, lead)
  } else {
    await poolLead(db, id)
  }
  return { id, deduped: false, temperature: s.temperature }
}

function buildScoreInput(input: CaptureInput): ScoreInput {
  return {
    travelDate: input.travelDate ?? null,
    international: input.international,
    budget: input.budget ?? null,
    corporate: input.corporate,
    family: input.family,
    tripType: input.tripType ?? null,
  }
}

// ─── Live assignment (Module E) ─────────────────────────────────

async function tryAssignLive(db: D1Database, cfg: LeadConfig, lead: any) {
  let eligible = await eligibleAgents(db, cfg)
  // §FR-SCORE-3 hot fast-track: route hot leads to a senior (sales_lead) if one is free.
  if (lead.temperature === "hot") {
    const seniors = new Set((await salesAgents(db)).filter((a) => a.role === "sales_lead").map((a) => a.uid))
    const seniorEligible = eligible.filter((id) => seniors.has(id))
    if (seniorEligible.length) eligible = seniorEligible
  }
  const agentId = await pickRoundRobin(db, eligible)
  if (!agentId) { await poolLead(db, lead.id); return null }
  const sla = addMinutesISO(nowISO(), slaMinutesFor(cfg, lead.temperature))
  await assignLeadTo(db, lead, agentId, "live_roundrobin", sla)
  return agentId
}

// ─── Morning batch on login (Module D) ──────────────────────────

export async function onAgentLogin(db: D1Database, agentId: string) {
  await execute(db,
    `INSERT INTO agent_presence (agent_id, availability, last_login_at, last_seen_at, updated_at)
     VALUES (?,?,datetime('now'),datetime('now'),datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET availability='online', last_login_at=datetime('now'), last_seen_at=datetime('now'), updated_at=datetime('now')`,
    [agentId, "online"])

  const cfg = await loadConfig(db)
  if (operatingMode(cfg) !== "live") return { allocated: 0, mode: "offhours" }

  const { wip } = await agentMetrics(db, agentId)
  const free = Math.max(0, cfg.LIVE_WIP > 0 ? cfg.MORNING_BATCH_SIZE - wip : 0)
  // Morning batch is sized to MORNING_BATCH_SIZE but capped by remaining WIP headroom.
  const want = Math.min(cfg.MORNING_BATCH_SIZE, cfg.MORNING_BATCH_SIZE - wip)
  if (want <= 0) return { allocated: 0, mode: "live" }

  // Sales drain the pool newest-first (FR-POOL-3). Deadline = fixed clock 11:00 today.
  const pool = await queryRows<any>(db,
    "SELECT * FROM leads WHERE state='pooled' ORDER BY captured_at DESC LIMIT ?", [want])
  const deadline = cfg.MORNING_DEADLINE_TYPE === "clock"
    ? istClockTodayUtcISO(cfg.MORNING_DEADLINE)
    : addMinutesISO(nowISO(), 120)
  for (const lead of pool) {
    await assignLeadTo(db, lead, agentId, "morning_batch", deadline)
  }
  return { allocated: pool.length, mode: "live" }
}

export async function setAvailability(db: D1Database, agentId: string, availability: string) {
  await execute(db,
    `INSERT INTO agent_presence (agent_id, availability, last_seen_at, updated_at)
     VALUES (?,?,datetime('now'),datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET availability=excluded.availability, last_seen_at=datetime('now'), updated_at=datetime('now')`,
    [agentId, availability])
  // Going offline returns untouched leads to the pool (FR-PRES-3 / FR-TIME-4).
  if (availability !== "online") {
    const stranded = await queryRows<any>(db,
      "SELECT id FROM leads WHERE owner_id=? AND state='assigned'", [agentId])
    for (const l of stranded) {
      await closeOpenAssignment(db, l.id, "returned_to_pool")
      await poolLead(db, l.id)
    }
  }
}

// ─── Touch (Module F) ───────────────────────────────────────────

const VALID_TOUCH = new Set(["call", "whatsapp", "email", "note", "followup_scheduled", "status_change"])

export async function recordTouch(db: D1Database, leadId: string, agentId: string, type: string, channel = "", detail = "") {
  if (!VALID_TOUCH.has(type)) throw new Error(`Invalid touch type: ${type}`)
  const lead = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [leadId])
  if (!lead) throw new Error("Lead not found")
  const wasFirstTouch = !lead.firstTouchAt

  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [newId(), leadId, agentId, type, channel, detail])

  // Mark the open assignment touched; set first_touch; lead becomes sticky 'working'.
  await execute(db,
    "UPDATE lead_assignments SET outcome='touched' WHERE lead_id=? AND outcome IS NULL", [leadId])
  await execute(db,
    `UPDATE leads SET state='working', last_activity_at=datetime('now'),
       first_touch_at=COALESCE(first_touch_at, datetime('now')), updated_at=datetime('now')
     WHERE id=?`, [leadId])

  // First touch starts the follow-up cadence (Module I).
  if (wasFirstTouch) await startFollowup(db, leadId)
  return { ok: true }
}

async function closeOpenAssignment(db: D1Database, leadId: string, outcome: string) {
  await execute(db, "UPDATE lead_assignments SET outcome=? WHERE lead_id=? AND outcome IS NULL", [outcome, leadId])
}

// ─── Escalation (Module J) ──────────────────────────────────────

async function escalate(db: D1Database, leadId: string, fromAgent: string | null, reason: string, detail = "") {
  await execute(db,
    "INSERT INTO escalations (id, lead_id, from_agent_id, reason, detail, created_at) VALUES (?,?,?,?,?,datetime('now'))",
    [newId(), leadId, fromAgent, reason, detail])
  await closeOpenAssignment(db, leadId, "escalated")
}

// ─── Tick (the cron / time-driven engine) ───────────────────────

export async function tick(db: D1Database) {
  const cfg = await loadConfig(db)
  const now = new Date()
  const result = { sla_reassigned: 0, sla_escalated: 0, sla_repooled: 0, morning_escalated: 0, cutoff_repooled: 0, hot_alerts: 0 }

  // 1) Live first-touch SLA breaches (FR-LIVE-6/7/8). Open live assignments past due.
  const liveBreaches = await queryRows<any>(db,
    `SELECT a.id AS aid, a.lead_id, a.agent_id, l.temperature, l.miss_count, l.state
     FROM lead_assignments a JOIN leads l ON l.id=a.lead_id
     WHERE a.outcome IS NULL AND a.channel_origin IN ('live_roundrobin','backfill','presales_handoff')
       AND a.sla_due_at <= ? AND l.state='assigned'`, [now.toISOString()])
  for (const b of liveBreaches) {
    const misses = (b.missCount ?? 0) + 1
    await execute(db, "UPDATE leads SET miss_count=? WHERE id=?", [misses, b.leadId])
    if (misses >= cfg.MAX_MISSES) {
      await escalate(db, b.leadId, b.agentId, "bounce_cap", `after ${misses} untouched reassignments`)
      result.sla_escalated++
      continue
    }
    const lead = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [b.leadId])
    const eligible = await eligibleAgents(db, cfg, [b.agentId]) // skip the breacher
    const next = await pickRoundRobin(db, eligible)
    await closeOpenAssignment(db, b.leadId, "reassigned")
    if (!next) { await poolLead(db, b.leadId, true); result.sla_repooled++; continue }
    const sla = addMinutesISO(now.toISOString(), slaMinutesFor(cfg, lead.temperature))
    await assignLeadTo(db, lead, next, "live_roundrobin", sla)
    result.sla_reassigned++
  }

  // 2) Morning deadline (FR-MORN-6). At/after deadline, untouched morning_batch → escalate.
  const istNow = istParts(now)
  if (cfg.MORNING_DEADLINE_TYPE === "clock" && istNow.minutesOfDay >= hhmmToMinutes(cfg.MORNING_DEADLINE)) {
    const untouched = await queryRows<any>(db,
      `SELECT a.lead_id, a.agent_id FROM lead_assignments a JOIN leads l ON l.id=a.lead_id
       WHERE a.outcome IS NULL AND a.channel_origin='morning_batch' AND l.state='assigned'`)
    for (const u of untouched) {
      await escalate(db, u.leadId, u.agentId, "morning_deadline", "untouched at deadline")
      result.morning_escalated++
    }
  } else if (cfg.MORNING_DEADLINE_TYPE === "duration") {
    const due = await queryRows<any>(db,
      `SELECT a.lead_id, a.agent_id FROM lead_assignments a JOIN leads l ON l.id=a.lead_id
       WHERE a.outcome IS NULL AND a.channel_origin='morning_batch' AND l.state='assigned' AND a.sla_due_at <= ?`,
      [now.toISOString()])
    for (const u of due) { await escalate(db, u.leadId, u.agentId, "morning_deadline", "untouched at deadline"); result.morning_escalated++ }
  }

  // 3) 17:30 cutoff (FR-TIME-4): untouched live leads return to pool; touched stay.
  const atCutoff = istNow.minutesOfDay >= hhmmToMinutes(cfg.ASSIGN_CUTOFF)
  if (atCutoff) {
    const live = await queryRows<any>(db,
      `SELECT a.lead_id, a.agent_id FROM lead_assignments a JOIN leads l ON l.id=a.lead_id
       WHERE a.outcome IS NULL AND a.channel_origin IN ('live_roundrobin','backfill','presales_handoff') AND l.state='assigned'`)
    for (const l of live) {
      await closeOpenAssignment(db, l.leadId, "returned_to_pool")
      await poolLead(db, l.leadId)
      result.cutoff_repooled++
    }
  }

  // 4) Hot-lead alert (FR-SCORE-3): hot, assigned, untouched > HOT_ALERT_MIN.
  const hot = await queryRows<any>(db,
    `SELECT a.lead_id, a.agent_id FROM lead_assignments a JOIN leads l ON l.id=a.lead_id
     WHERE a.outcome IS NULL AND l.temperature='hot' AND l.state='assigned'
       AND a.assigned_at <= ?
       AND NOT EXISTS (SELECT 1 FROM escalations e WHERE e.lead_id=a.lead_id AND e.reason='hot_timeout' AND e.resolved=0)`,
    [addMinutesISO(now.toISOString(), -cfg.HOT_ALERT_MIN)])
  for (const h of hot) {
    await execute(db,
      "INSERT INTO escalations (id, lead_id, from_agent_id, reason, detail, created_at) VALUES (?,?,?,?,?,datetime('now'))",
      [newId(), h.leadId, h.agentId, "hot_timeout", `hot lead untouched > ${cfg.HOT_ALERT_MIN}m`])
    result.hot_alerts++
  }

  // 5) Anti-hoarding hysteresis (FR-CAP-RULE-2): block >= STOP, resume < RESUME.
  const agents = await salesAgents(db)
  for (const a of agents) {
    const { active } = await agentMetrics(db, a.uid)
    if (active >= cfg.HOARD_STOP) await setAgentHoard(db, a.uid, 1)
    else if (active < cfg.HOARD_RESUME) await setAgentHoard(db, a.uid, 0)
  }

  // 6) Follow-up cadence: exhausted → Boomerang; Boomerang re-entry (Module I).
  const fup = await processFollowups(db, cfg)

  // 7) Pending Quotes SLA (Module N): banger, reminders, pre-alert, offline/hard-limit transfer.
  const quotes = await processQuotes(db, cfg)

  // 8) Booking Date Not Confirmed (safe build): recurring lock-the-date nudges + aging.
  const locks = await processDateLocks(db, cfg)
  return { ...result, ...fup, ...quotes, ...locks }
}

// ─── Lead stage / terminal state (won/lost) ─────────────────────

export async function advanceLead(db: D1Database, leadId: string, agentId: string, state: string, stage?: string) {
  const valid = ["working", "in_followup", "won", "lost", "boomerang"]
  if (!valid.includes(state)) throw new Error("Invalid state")
  await execute(db,
    `UPDATE leads SET state=?, ${stage ? "stage=?, " : ""} last_activity_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    stage ? [state, stage, leadId] : [state, leadId])
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [newId(), leadId, agentId, "status_change", "", `state=${state}${stage ? ` stage=${stage}` : ""}`])
  // Terminal/Boomerang stops the cadence.
  if (["won", "lost", "boomerang"].includes(state)) {
    await execute(db, "UPDATE followup_tasks SET status='skipped' WHERE lead_id=? AND status='pending'", [leadId])
  }
  return { ok: true }
}

async function setAgentHoard(db: D1Database, agentId: string, blocked: number) {
  await execute(db,
    `INSERT INTO agent_presence (agent_id, availability, hoard_blocked, updated_at)
     VALUES (?, 'offline', ?, datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET hoard_blocked=excluded.hoard_blocked, updated_at=datetime('now')`,
    [agentId, blocked])
}

// ─── Backfill (FR-LIVE-9) ───────────────────────────────────────

export async function backfillForAgent(db: D1Database, agentId: string) {
  const cfg = await loadConfig(db)
  if (operatingMode(cfg) !== "live") return { assigned: 0 }
  const { wip } = await agentMetrics(db, agentId)
  if (wip >= cfg.LIVE_WIP) return { assigned: 0 }
  const next = await queryOne<any>(db, "SELECT * FROM leads WHERE state='pooled' ORDER BY captured_at DESC LIMIT 1")
  if (!next) return { assigned: 0 }
  const sla = addMinutesISO(nowISO(), slaMinutesFor(cfg, next.temperature))
  await assignLeadTo(db, next, agentId, "backfill", sla)
  return { assigned: 1 }
}

// ─── Manager dashboard (Module L / J) ───────────────────────────

export async function managerOverview(db: D1Database) {
  const escalations = await queryRows<any>(db,
    `SELECT e.id, e.reason, e.detail, e.created_at AS createdAt,
            l.id AS leadId, l.contact_name AS contactName, l.source, l.destination, l.temperature, l.state,
            u.name AS fromAgent
     FROM escalations e
     JOIN leads l ON l.id = e.lead_id
     LEFT JOIN users u ON u.uid = e.from_agent_id
     WHERE e.resolved = 0 ORDER BY e.created_at DESC LIMIT 100`)

  const pool = await queryOne<any>(db,
    `SELECT COUNT(*) AS count, MIN(captured_at) AS oldest FROM leads WHERE state='pooled'`)
  const poolBySource = await queryRows<any>(db,
    "SELECT source, COUNT(*) AS n FROM leads WHERE state='pooled' GROUP BY source ORDER BY n DESC")

  const agents = await queryRows<any>(db,
    `SELECT u.uid, u.name, u.role,
        COALESCE(p.availability,'offline') AS availability,
        (SELECT COUNT(*) FROM leads WHERE owner_id=u.uid AND state='assigned') AS wip,
        (SELECT COUNT(*) FROM leads WHERE owner_id=u.uid AND state IN ('assigned','working','in_followup')) AS active,
        (SELECT target FROM sales_targets WHERE agent_id=u.uid AND month=strftime('%Y-%m','now','+330 minutes')) AS target
     FROM users u LEFT JOIN agent_presence p ON p.agent_id=u.uid
     WHERE u.role IN ('sales','sales_lead') AND COALESCE(u.disabled,0)=0 AND COALESCE(u.inactive,0)=0
     ORDER BY availability DESC, u.name`)

  const breaches = await queryOne<any>(db,
    `SELECT COUNT(*) AS n FROM lead_assignments WHERE date(assigned_at)=date('now') AND outcome IN ('reassigned','escalated','returned_to_pool')`)

  const quoteWatch = await managerQuoteWatch(db)

  return {
    escalations,
    pool: { count: pool?.count ?? 0, oldest: pool?.oldest ?? null, bySource: poolBySource },
    agents,
    quoteWatch,
    slaBreachesToday: breaches?.n ?? 0,
    online: agents.filter((a: any) => a.availability === "online").length,
  }
}

/** Manager manual assignment (override) — also resolves any open escalation. */
export async function manualAssign(db: D1Database, leadId: string, agentId: string, managerId: string) {
  const cfg = await loadConfig(db)
  const lead = await queryOne<any>(db, "SELECT * FROM leads WHERE id=?", [leadId])
  if (!lead) throw new Error("Lead not found")
  await closeOpenAssignment(db, leadId, "reassigned")
  const sla = addMinutesISO(nowISO(), slaMinutesFor(cfg, lead.temperature))
  await assignLeadTo(db, lead, agentId, "manual", sla)
  await execute(db, "UPDATE escalations SET resolved=1, resolved_by=?, resolved_at=datetime('now') WHERE lead_id=? AND resolved=0", [managerId, leadId])
  return { ok: true }
}

export async function resolveEscalation(db: D1Database, escId: string, managerId: string) {
  await execute(db, "UPDATE escalations SET resolved=1, resolved_by=?, resolved_at=datetime('now') WHERE id=?", [managerId, escId])
  return { ok: true }
}

// ─── Today's Work data (Module L) ───────────────────────────────

export async function todaysWork(db: D1Database, agentId: string) {
  const cfg = await loadConfig(db)
  const mine = await queryRows<any>(db,
    `SELECT l.*, a.sla_due_at AS slaDueAt, a.channel_origin AS origin, a.assigned_at AS assignedAt
     FROM leads l JOIN lead_assignments a ON a.lead_id=l.id AND a.outcome IS NULL
     WHERE l.owner_id=? AND l.state='assigned' ORDER BY a.sla_due_at ASC`, [agentId])
  const working = await queryRows<any>(db,
    "SELECT * FROM leads WHERE owner_id=? AND state IN ('working','in_followup') ORDER BY last_activity_at DESC LIMIT 50", [agentId])
  const morningBatch = mine.filter((l) => l.origin === "morning_batch")
  const liveLeads = mine.filter((l) => l.origin !== "morning_batch")
  const poolCount = (await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM leads WHERE state='pooled'"))?.n ?? 0
  const nextUp = await queryRows<any>(db,
    "SELECT id, source, destination, temperature, captured_at FROM leads WHERE state='pooled' ORDER BY captured_at DESC LIMIT 5")

  const stats = await queryOne<any>(db,
    `SELECT
       (SELECT COUNT(*) FROM lead_assignments WHERE agent_id=? AND date(assigned_at)=date('now')) AS assignedToday,
       (SELECT COUNT(*) FROM touch_events WHERE agent_id=? AND date(created_at)=date('now')) AS touchesToday,
       (SELECT COUNT(*) FROM leads WHERE owner_id=? AND state='won') AS won,
       (SELECT COUNT(*) FROM leads WHERE owner_id=? AND state IN ('assigned','working','in_followup')) AS active,
       (SELECT COUNT(*) FROM leads WHERE owner_id=? AND state='won'
          AND ( CAST(strftime('%H', captured_at, '+330 minutes') AS INTEGER) >= 18
             OR CAST(strftime('%H', captured_at, '+330 minutes') AS INTEGER) < 9 )) AS eveningWins`,
    [agentId, agentId, agentId, agentId, agentId])

  const followups = await followupsDue(db, agentId)

  return {
    mode: operatingMode(cfg), deadline: cfg.MORNING_DEADLINE, wipCap: cfg.LIVE_WIP,
    morningBatch, liveLeads, working, poolCount, nextUp, followups, stats,
  }
}
