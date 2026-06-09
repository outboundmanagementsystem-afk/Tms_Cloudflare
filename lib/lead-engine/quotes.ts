// Lead Engine — Module N: Pending Quotes SLA (PRD v1.1).
// The quote clock starts when a lead enters `Pending Quotes` and stops ONLY when the
// quote is actually sent (dispatched + logged) → `Quote Given`. All quote timers are
// working-hours-aware (elapsed measured in working minutes), so off-hours pauses them.
//
// Timer ladder after the clock starts:
//   QUOTE_SLA (30m)        → banger (persistent audible+visual alert to the owner)
//   +QUOTE_REMINDER (5m)   → re-fire reminders until sent
//   QUOTE_MANAGER_PREALERT → manager pre-alert (so a transfer is not a surprise)
//   QUOTE_HARD_LIMIT       → transfer to next agent with a fresh clock + handoff
//   owner offline > grace  → early transfer (don't wait the hard limit)
//   transfers >= cap       → escalate to manager (hand-assign), not a 3rd agent

import { queryRows, queryOne, execute, newId } from "@/lib/db"
import { loadConfig, workingMinutesBetween, addMinutesISO, operatingMode, type LeadConfig } from "./config"
import { eligibleAgents, pickRoundRobin } from "./roster"
import { startFollowup } from "./followup"

const nowISO = () => new Date().toISOString()

async function logEvent(db: D1Database, leadId: string, agentId: string, type: string, detail: string, channel = "") {
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
    [newId(), leadId, agentId, type, channel, detail])
}

// ─── FR-QUOTE-1: start the quote SLA when a lead enters Pending Quotes ──
export async function startQuoteSla(db: D1Database, leadId: string, agentId: string) {
  const cfg = await loadConfig(db)
  const lead = await queryOne<any>(db, "SELECT id, owner_id, quote_sla_started_at, quote_sent_at FROM leads WHERE id=?", [leadId])
  if (!lead) return null
  // Idempotent: if a quote clock is already running and unsent, leave it.
  if (lead.quoteSlaStartedAt && !lead.quoteSentAt) return { ok: true, alreadyRunning: true }
  const start = nowISO()
  await execute(db,
    `UPDATE leads SET state='working', stage='PENDING_QUOTE',
        quote_sla_started_at=?, quote_due_at=?, quote_sent_at=NULL, quote_breached=0,
        quote_last_reminder_at=NULL, quote_prealert_sent=0, quote_acked_at=NULL,
        last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`,
    [start, addMinutesISO(start, cfg.QUOTE_SLA), leadId])
  await logEvent(db, leadId, agentId, "status_change", `Entered Pending Quotes — quote SLA ${cfg.QUOTE_SLA}m started`)
  return { ok: true }
}

// ─── FR-QUOTE-2: the ONLY stop — the quote is actually sent ──
export async function sendQuote(db: D1Database, leadId: string, agentId: string, opts: { channel?: string; docRef?: string; failed?: boolean } = {}) {
  const lead = await queryOne<any>(db, "SELECT id, owner_id FROM leads WHERE id=?", [leadId])
  if (!lead) return null
  const channel = opts.channel || "whatsapp"

  if (opts.failed) {
    // FR-QUOTE-2: a failed/bounced send is NOT a stop — timer continues, failure flagged.
    await execute(db,
      "INSERT INTO quotes (id, lead_id, agent_id, status, channel, doc_ref, created_at) VALUES (?,?,?,?,?,?,datetime('now'))",
      [newId(), leadId, agentId, "send_failed", channel, opts.docRef || ""])
    await logEvent(db, leadId, agentId, "note", `Quote send FAILED (${channel}) — SLA continues`)
    return { ok: false, failed: true }
  }

  const sentAt = nowISO()
  await execute(db,
    "INSERT INTO quotes (id, lead_id, agent_id, status, channel, doc_ref, created_at, sent_at) VALUES (?,?,?,?,?,?,datetime('now'),?)",
    [newId(), leadId, agentId, "sent", channel, opts.docRef || "", sentAt])
  // Quote Given → stop the clock, enter the follow-up quote sub-sequence (FR-QUOTE-12).
  await execute(db,
    `UPDATE leads SET stage='QUOTE_GIVEN', state='in_followup', quote_sent_at=?,
        last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`, [sentAt, leadId])
  await logEvent(db, leadId, agentId, "status_change", `Quote sent (${channel}) → Quote Given`, channel)
  await startFollowup(db, leadId).catch(() => {})
  return { ok: true, sentAt }
}

// ─── FR-QUOTE-4/AC-9: acknowledge quiets the popup but NOT the clock/reminders ──
export async function ackQuote(db: D1Database, leadId: string, agentId: string) {
  await execute(db, "UPDATE leads SET quote_acked_at=datetime('now') WHERE id=? AND owner_id=?", [leadId, agentId])
  return { ok: true }
}

// ─── Extend a breached quote SLA by +30m or +1h (owner asks for more time) ──
// Grants extra working minutes on top of QUOTE_SLA, clears the breach + reminders,
// and re-arms the clock. If the lead later breaches AGAIN, processQuotes alerts the
// team leader (reason 'quote_missed_after_extension').
export async function extendQuote(db: D1Database, leadId: string, agentId: string, minutes: number) {
  const m = minutes >= 60 ? 60 : 30 // only 30 or 60 are offered
  const lead = await queryOne<any>(db,
    "SELECT id, quote_extra_min, quote_sla_started_at, quote_sent_at FROM leads WHERE id=? AND owner_id=?", [leadId, agentId])
  if (!lead) return null
  if (!lead.quoteSlaStartedAt) return { ok: false, noClock: true }
  if (lead.quoteSentAt) return { ok: false, alreadySent: true }
  const cfg = await loadConfig(db)
  const extra = (lead.quoteExtraMin || 0) + m
  await execute(db,
    `UPDATE leads SET quote_extra_min=?, quote_extended=quote_extended+1, quote_breached=0,
        quote_last_reminder_at=NULL, quote_acked_at=NULL, quote_prealert_sent=0,
        quote_due_at=?, last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`,
    [extra, addMinutesISO(nowISO(), m), leadId])
  await logEvent(db, leadId, agentId, "status_change", `Quote SLA extended +${m}m (now ${cfg.QUOTE_SLA + extra}m total)`)
  return { ok: true, extraMin: extra, addedMin: m, slaTotal: cfg.QUOTE_SLA + extra }
}

// ─── The owner's live quote alerts (banger UI polls this) ──
export async function quoteAlertsForAgent(db: D1Database, agentId: string) {
  const cfg = await loadConfig(db)
  const rows = await queryRows<any>(db,
    `SELECT id, contact_name AS name, destination, quote_sla_started_at, quote_breached, quote_acked_at,
            quote_last_reminder_at, quote_extra_min, quote_extended
     FROM leads WHERE owner_id=? AND quote_sla_started_at IS NOT NULL AND quote_sent_at IS NULL`, [agentId])
  const out = rows.map((r: any) => {
    const elapsed = workingMinutesBetween(cfg, r.quoteSlaStartedAt)
    const extra = r.quoteExtraMin || 0
    const slaTotal = cfg.QUOTE_SLA + extra
    return {
      id: r.id, name: r.name || "Lead", destination: r.destination || "",
      elapsedMin: Math.floor(elapsed), remainingMin: Math.max(0, Math.ceil(slaTotal - elapsed)),
      breached: elapsed >= slaTotal || !!r.quoteBreached, acked: !!r.quoteAckedAt,
      lastReminderAt: r.quoteLastReminderAt,
      extraMin: extra, extended: (r.quoteExtended || 0) > 0,
    }
  })
  return { quotes: out, slaMin: cfg.QUOTE_SLA }
}

// ─── FR-QUOTE-3/4/5/6/8/10: the timer engine, called every tick ──
export async function processQuotes(db: D1Database, cfg: LeadConfig) {
  const res = { quote_breached: 0, quote_reminders: 0, quote_prealerts: 0, quote_transfers: 0, quote_escalated: 0 }
  const open = await queryRows<any>(db,
    `SELECT id, owner_id, quote_sla_started_at, quote_breached, quote_prealert_sent, quote_last_reminder_at,
            quote_transfers, quote_extra_min, quote_extended
     FROM leads WHERE quote_sla_started_at IS NOT NULL AND quote_sent_at IS NULL`)
  if (!open.length) return res

  const live = operatingMode(cfg) === "live"
  const presence = await presenceMap(db)

  for (const l of open) {
    const elapsed = workingMinutesBetween(cfg, l.quoteSlaStartedAt)

    // --- Offline early transfer (FR-QUOTE-8): owner not online during working hours > grace.
    if (live) {
      const p = presence.get(l.ownerId)
      if (p && p.availability !== "online") {
        const offFor = workingMinutesBetween(cfg, p.updatedAt)
        if (offFor >= cfg.QUOTE_OFFLINE_GRACE) {
          await transferOrEscalate(db, cfg, l, "owner offline during working hours", res)
          continue
        }
      }
    }

    // --- Hard-limit transfer (FR-QUOTE-6).
    if (elapsed >= cfg.QUOTE_HARD_LIMIT) {
      await transferOrEscalate(db, cfg, l, `quote unsent ${Math.floor(elapsed)}m (hard limit)`, res)
      continue
    }

    // --- Manager pre-alert (FR-QUOTE-5).
    if (elapsed >= cfg.QUOTE_MANAGER_PREALERT && !l.quotePrealertSent) {
      await execute(db, "UPDATE leads SET quote_prealert_sent=1 WHERE id=?", [l.id])
      res.quote_prealerts++
    }

    // --- Banger + reminders (FR-QUOTE-3/4). Threshold includes any granted extension.
    const slaTotal = cfg.QUOTE_SLA + (l.quoteExtraMin || 0)
    if (elapsed >= slaTotal) {
      if (!l.quoteBreached) {
        await execute(db, "UPDATE leads SET quote_breached=1, quote_last_reminder_at=datetime('now') WHERE id=?", [l.id])
        res.quote_breached++
        // Missed the deadline AFTER using an extension → alert the team leader (once).
        if ((l.quoteExtended || 0) > 0) {
          const existing = await queryOne<any>(db,
            "SELECT id FROM escalations WHERE lead_id=? AND reason='quote_missed_after_extension' AND resolved=0", [l.id])
          if (!existing) {
            await execute(db,
              "INSERT INTO escalations (id, lead_id, from_agent_id, reason, detail, created_at) VALUES (?,?,?,?,?,datetime('now'))",
              [newId(), l.id, l.ownerId, "quote_missed_after_extension", `quote still unsent after a +${l.quoteExtraMin}m extension (${Math.floor(elapsed)}m elapsed)`])
            res.quote_escalated++
          }
        }
      } else {
        const sinceReminder = l.quoteLastReminderAt ? workingMinutesBetween(cfg, l.quoteLastReminderAt) : Infinity
        if (sinceReminder >= cfg.QUOTE_REMINDER_INTERVAL) {
          await execute(db, "UPDATE leads SET quote_last_reminder_at=datetime('now'), quote_acked_at=NULL WHERE id=?", [l.id])
          res.quote_reminders++
        }
      }
    }
  }
  return res
}

// Transfer to the next eligible agent with a fresh quote SLA + handoff; cap → manager.
async function transferOrEscalate(db: D1Database, cfg: LeadConfig, lead: any, reason: string, res: any) {
  const used = lead.quoteTransfers ?? 0
  if (used >= cfg.QUOTE_TRANSFER_CAP) {
    // FR-QUOTE-10: escalate to a manager for hand-assignment (only once).
    const existing = await queryOne<any>(db,
      "SELECT id FROM escalations WHERE lead_id=? AND reason='quote_transfer_cap' AND resolved=0", [lead.id])
    if (!existing) {
      await execute(db,
        "INSERT INTO escalations (id, lead_id, from_agent_id, reason, detail, created_at) VALUES (?,?,?,?,?,datetime('now'))",
        [newId(), lead.id, lead.ownerId, "quote_transfer_cap", `quote unsent after ${used} transfer(s) — ${reason}`])
      res.quote_escalated++
    }
    return
  }
  const eligible = await eligibleAgents(db, cfg, [lead.ownerId])
  const next = await pickRoundRobin(db, eligible)
  if (!next) return // nobody free — keep with owner, retry next tick
  // Audit the old assignment, hand off with a fresh quote clock (FR-QUOTE-6/9).
  await execute(db,
    "INSERT INTO lead_assignments (id, lead_id, agent_id, assigned_at, sla_due_at, channel_origin, outcome) VALUES (?,?,?,datetime('now'),datetime('now'),'quote_transfer','quote_transferred')",
    [newId(), lead.id, lead.ownerId])
  const start = nowISO()
  await execute(db,
    `UPDATE leads SET owner_id=?, quote_sla_started_at=?, quote_due_at=?, quote_breached=0,
        quote_last_reminder_at=NULL, quote_prealert_sent=0, quote_acked_at=NULL, quote_transfers=?,
        last_activity_at=datetime('now'), updated_at=datetime('now')
     WHERE id=?`,
    [next, start, addMinutesISO(start, cfg.QUOTE_SLA), used + 1, lead.id])
  await logEvent(db, lead.id, lead.ownerId, "status_change", `Quote transferred (${reason}) — fresh ${cfg.QUOTE_SLA}m clock`)
  res.quote_transfers++
}

async function presenceMap(db: D1Database) {
  const rows = await queryRows<any>(db, "SELECT agent_id, availability, updated_at FROM agent_presence")
  const m = new Map<string, { availability: string; updatedAt: string }>()
  for (const r of rows) m.set(r.agentId, { availability: r.availability, updatedAt: r.updatedAt })
  return m
}

// ─── Manager watch list: pending quotes past the pre-alert threshold (Module L/J) ──
export async function managerQuoteWatch(db: D1Database, cfg?: LeadConfig) {
  const c = cfg || (await loadConfig(db))
  const rows = await queryRows<any>(db,
    `SELECT l.id, l.contact_name AS name, l.destination, l.temperature, l.quote_sla_started_at, l.quote_transfers, l.quote_breached, u.name AS owner
     FROM leads l LEFT JOIN users u ON u.uid=l.owner_id
     WHERE l.quote_sla_started_at IS NOT NULL AND l.quote_sent_at IS NULL`)
  return rows
    .map((r: any) => ({
      id: r.id, name: r.name || "Lead", destination: r.destination || "", owner: r.owner || "—",
      temperature: r.temperature, transfers: r.quoteTransfers || 0, breached: !!r.quoteBreached,
      elapsedMin: Math.floor(workingMinutesBetween(c, r.quoteSlaStartedAt)),
    }))
    .filter((q) => q.elapsedMin >= c.QUOTE_MANAGER_PREALERT)
    .sort((a, b) => b.elapsedMin - a.elapsedMin)
}
