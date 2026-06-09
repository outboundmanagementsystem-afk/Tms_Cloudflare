// Outbound One — CRM (SalesFlow) data layer.
// "All Leads" 13-stage Kanban + lead drawer, backed by the real `leads` D1 table.
// EVERY query is scoped to the owning salesperson (owner_id) — one rep never sees
// another rep's leads. Notes/history come from `touch_events`; documents from
// `lead_documents` (R2). No seed data — all views start empty.

import { queryRows, queryOne, execute, newId, now } from "@/lib/db"
import { startQuoteSla, sendQuote } from "@/lib/lead-engine/quotes"

// ─── The 13 sales pipeline stages (Kanban columns, left → right) ──
export const STAGES = [
  { id: "NEW",            label: "New",            icon: "🟣", accent: "#06a15c", desc: "Fresh, no contact yet",      action: "callback"   },
  { id: "CALLBACK",       label: "Call Back",      icon: "📞", accent: "#d4a017", desc: "Callback scheduled",         action: "callback"   },
  { id: "NOT_ATTENDED",   label: "Not Attended",   icon: "⏳", accent: "#d4a017", desc: "Call not picked up",         action: "callback"   },
  { id: "NOT_INTERESTED", label: "Not Interested", icon: "✋", accent: "#e07856", desc: "Declined — for now",         action: "notint"     },
  { id: "PENDING_QUOTE",  label: "Pending Quote",  icon: "📝", accent: "#0e9488", desc: "Quote being prepared",       action: "interested" },
  { id: "QUOTE_GIVEN",    label: "Quote Given",    icon: "📄", accent: "#0e9488", desc: "Quote sent, awaiting reply", action: "interested" },
  { id: "BOOKING_POTENTIAL", label: "Booking Potential", icon: "💎", accent: "#0e9488", desc: "Strong intent — likely to book", action: "interested" },
  { id: "IN_DISCUSSION",  label: "In Discussion",  icon: "💬", accent: "#0e9488", desc: "Negotiating the deal",       action: "interested" },
  { id: "CTW",            label: "CTW",            icon: "🔥", accent: "#d4a017", desc: "Closing this week",          action: "interested" },
  { id: "CNW",            label: "CNW",            icon: "📆", accent: "#d4a017", desc: "Closing next week",          action: "interested" },
  { id: "NO_RESPONSE",    label: "No Response",    icon: "🔕", accent: "#d4a017", desc: "Gone silent",                action: "callback"   },
  { id: "BOOMERANG",      label: "Boomerang",      icon: "🔄", accent: "#0e9488", desc: "Re-engaging an old lead",    action: "callback"   },
  { id: "BOOKING_DATE_UNCONFIRMED", label: "Date Not Confirmed", icon: "📅", accent: "#7c3aed", desc: "Committed to book, date not fixed", action: null },
  { id: "WON",            label: "Won",            icon: "🏆", accent: "#06a15c", desc: "Closed & booked",            action: null         },
  { id: "LOST",           label: "Lost",           icon: "❌", accent: "#e07856", desc: "Dead / lost",                action: null         },
] as const

export const STAGE_IDS = STAGES.map(s => s.id)
const STAGE_SET = new Set<string>(STAGE_IDS)
export function normStage(s?: string | null): string {
  if (!s) return "NEW"
  const u = String(s).toUpperCase().replace(/[\s-]+/g, "_")
  return STAGE_SET.has(u) ? u : "NEW"
}

export const CHANNELS = ["instagram", "whatsapp", "tiktok", "fb_ads", "facebook", "google", "youtube", "direct"]
export const COUNTRIES = [
  { id: "AE", label: "UAE", dial: "+971" }, { id: "IN", label: "India", dial: "+91" },
  { id: "SA", label: "Saudi", dial: "+966" }, { id: "OM", label: "Oman", dial: "+968" },
  { id: "US", label: "USA/Canada", dial: "+1" }, { id: "QA", label: "Qatar", dial: "+974" },
]
export const TRAVEL_TYPES = ["Honeymoon", "Family", "Group Tour", "Solo", "Business", "Adventure", "Luxury"]

// Sub-options for the "Interested" workflow.
export const INTERESTED_SUBS = ["Pending Quotes", "Quote Given", "Booking Potential"]

// Map a workflow action + sub-choice to the resulting stage.
export function stageForAction(action: string, sub?: string): string {
  if (action === "callback") {
    if (sub === "Not Reachable" || sub === "Not Answered") return "NOT_ATTENDED"
    if (sub === "DND") return "NOT_INTERESTED"
    return "CALLBACK"
  }
  if (action === "interested") {
    if (sub === "Pending Quotes") return "PENDING_QUOTE"
    if (sub === "Quote Given") return "QUOTE_GIVEN"
    if (sub === "Booking Potential") return "BOOKING_POTENTIAL"
    return "IN_DISCUSSION"
  }
  if (action === "notint") return "LOST" // "Not Interested" drops the lead into the Lost pipeline
  return "NEW"
}

const LEAD_LIST_COLS = `id, source, contact_name, phone, email, country, handle, destination, travel_date,
            budget, budget_text, trip_type, pax, adults, children, children_ages, travel_duration,
            score, temperature, state, stage, owner_id,
            follow_up_at, meeting_at, interested_sub, lost_reason, booked_value, attempts,
            quote_sla_started_at, quote_due_at, quote_sent_at, quote_breached, quote_transfers,
            estimated_date, estimated_granularity, date_confirmed, lock_due_at, lock_nudge_count, bdu_flagged,
            captured_at, first_touch_at, last_activity_at, created_at, updated_at`

function groupLeads(rows: any[]) {
  const columns: Record<string, any[]> = {}
  const counts: Record<string, number> = {}
  for (const id of STAGE_IDS) { columns[id] = []; counts[id] = 0 }
  for (const r of rows) {
    const st = normStage(r.stage)
    columns[st].push(shapeLead(r))
    counts[st]++
  }
  return { columns, counts, total: rows.length }
}

// ─── List one rep's leads, grouped into Kanban columns + KPI counts ──
export async function listMyLeads(db: D1Database, ownerId: string) {
  const rows = await queryRows<any>(db,
    `SELECT ${LEAD_LIST_COLS} FROM leads WHERE owner_id = ? ORDER BY updated_at DESC`, [ownerId])
  return groupLeads(rows)
}

// Same as listMyLeads but resolves the owner uid from the rep's email inside the
// query — one remote round trip total (vs. a separate users lookup + leads query).
// Mirrors getAgent's resolution: prefer the users-table uid for this email, else fall
// back to the JWT uid (reps without a users row own leads under their token uid).
export async function listMyLeadsByEmail(db: D1Database, email: string, fallbackUid: string) {
  const rows = await queryRows<any>(db,
    `SELECT ${LEAD_LIST_COLS} FROM leads
       WHERE owner_id = COALESCE((SELECT uid FROM users WHERE lower(email) = lower(?) LIMIT 1), ?)
       ORDER BY updated_at DESC`, [email, fallbackUid])
  return groupLeads(rows)
}

// ─── Today's Work board: New today · Follow-ups due · Meetings today ──
export async function myTodaysWork(db: D1Database, ownerId: string) {
  const all = await queryRows<any>(db,
    `SELECT * FROM leads WHERE owner_id = ? AND stage NOT IN ('WON','LOST')`, [ownerId])
  const todayKey = istDateKey()
  const nowMs = Date.now()
  const newToday: any[] = [], followups: any[] = [], meetings: any[] = []
  for (const r of all) {
    const lead = shapeLead(r)
    if (istDateKey(r.captured_at) === todayKey && normStage(r.stage) === "NEW") newToday.push(lead)
    if (r.follow_up_at && new Date(r.follow_up_at).getTime() <= nowMs + 24 * 3600_000) followups.push(lead)
    if (r.meeting_at && istDateKey(r.meeting_at) === todayKey) meetings.push(lead)
  }
  followups.sort((a, b) => (a.followUpAt || "").localeCompare(b.followUpAt || ""))
  meetings.sort((a, b) => (a.meetingAt || "").localeCompare(b.meetingAt || ""))
  return { newToday, followups, meetings }
}

// ─── Single lead + notes/history (touch_events) + documents ──────
export async function getLeadDetail(db: D1Database, id: string, ownerId: string) {
  // Fire all three reads in one wall-clock round trip (remote D1 latency dominates).
  const [r, events, docs] = await Promise.all([
    queryOne<any>(db, "SELECT * FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId]),
    queryRows<any>(db, "SELECT id, type, channel, detail, agent_id, created_at FROM touch_events WHERE lead_id = ? ORDER BY created_at DESC LIMIT 100", [id]),
    queryRows<any>(db, "SELECT id, name, size, content_type, created_at FROM lead_documents WHERE lead_id = ? ORDER BY created_at DESC", [id]),
  ])
  if (!r) return null
  return {
    ...shapeLead(r),
    history: events.map((e: any) => ({ id: e.id, type: e.type, channel: e.channel, detail: e.detail, at: e.createdAt })),
    notes: events.filter((e: any) => e.type === "note").map((e: any) => ({ id: e.id, text: e.detail, at: e.createdAt })),
    documents: docs.map((d: any) => ({ id: d.id, name: d.name, size: d.size, contentType: d.contentType, at: d.createdAt })),
  }
}

// ─── Create a manual lead (owned by the rep, stage NEW) ──────────
export async function createManualLead(db: D1Database, ownerId: string, f: any) {
  const id = newId()
  const ts = now()
  // Pax breakdown: adults + children (each child's age stored; age 0 = infant).
  const adults = Math.max(1, Number(f.adults) || 1)
  const children = Math.max(0, Number(f.children) || 0)
  const childrenAges = Array.isArray(f.childrenAges)
    ? f.childrenAges.slice(0, children).map((a: any) => Math.max(0, Number(a) || 0))
    : []
  const pax = Number(f.pax) || (adults + children)
  await execute(db,
    `INSERT INTO leads (id, source, contact_name, phone, email, country, destination, travel_date,
        budget, budget_text, trip_type, pax, adults, children, children_ages, travel_duration,
        temperature, state, stage, owner_id,
        follow_up_at, meeting_at, captured_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, (f.source || "direct").toLowerCase(), f.contactName || "", f.phone || "", f.email || "",
     f.country || "", f.destination || "", f.travelDate || null,
     f.budget ? Number(f.budget) : null, f.budgetText || "", f.tripType || "", pax,
     adults, children, JSON.stringify(childrenAges), f.travelDuration || "",
     "cold", "assigned", "NEW", ownerId,
     f.followUpAt || null, f.meetingAt || null, ts, ts, ts])
  await logEvent(db, id, ownerId, "status_change", "", "Lead created manually")
  return id
}

// ─── Apply a workflow action (callback / interested / notint) ────
export async function applyAction(db: D1Database, id: string, ownerId: string, body: any) {
  const lead = await queryOne<any>(db, "SELECT id, attempts FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId])
  if (!lead) return null
  const action = String(body.action || "")
  const sub = body.sub ? String(body.sub) : ""
  const note = body.note ? String(body.note) : ""
  const stage = body.stage ? normStage(body.stage) : stageForAction(action, sub)

  const sets: string[] = ["stage = ?", "updated_at = ?", "last_activity_at = ?"]
  const vals: any[] = [stage, now(), now()]
  if (action === "callback") { sets.push("attempts = attempts + 1") }
  if (sub) { sets.push("interested_sub = ?"); vals.push(sub) }
  if (body.followUpAt !== undefined) { sets.push("follow_up_at = ?"); vals.push(body.followUpAt || null) }
  if (body.meetingAt !== undefined) { sets.push("meeting_at = ?"); vals.push(body.meetingAt || null) }
  if (action === "notint") { sets.push("lost_reason = ?"); vals.push(body.reason || note || "") }
  if (stage === "WON" && body.bookedValue) { sets.push("booked_value = ?"); vals.push(String(body.bookedValue)) }
  vals.push(id, ownerId)

  await execute(db, `UPDATE leads SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`, vals)
  const label = STAGES.find(s => s.id === stage)?.label || stage
  await logEvent(db, id, ownerId, "status_change", "", `→ ${label}${sub ? ` · ${sub}` : ""}${note ? ` — ${note}` : ""}`)
  if (note) await logEvent(db, id, ownerId, "note", "", note)
  // Module N: entering Pending Quotes starts the quote SLA clock.
  if (stage === "PENDING_QUOTE") await startQuoteSla(db, id, ownerId)
  return { ok: true, stage }
}

// ─── Move a lead directly to a stage (drag/drop or quick action) ──
export async function moveStage(db: D1Database, id: string, ownerId: string, stage: string) {
  const st = normStage(stage)
  const r = await execute(db,
    "UPDATE leads SET stage = ?, updated_at = ?, last_activity_at = ? WHERE id = ? AND owner_id = ?",
    [st, now(), now(), id, ownerId])
  if (!r.meta?.changes) return null
  await logEvent(db, id, ownerId, "status_change", "", `Moved to ${STAGES.find(s => s.id === st)?.label || st}`)
  // Module N: dragging a card into Pending Quotes starts the quote SLA. (Moving to
  // Quote Given does NOT stop it — only a real "send quote" does, FR-QUOTE-2.)
  if (st === "PENDING_QUOTE") await startQuoteSla(db, id, ownerId)
  return { ok: true, stage: st }
}

// Module N: the real "send quote" event — the only thing that stops the quote SLA.
export async function sendLeadQuote(db: D1Database, id: string, ownerId: string, opts: { channel?: string; docRef?: string; failed?: boolean } = {}) {
  const lead = await queryOne<any>(db, "SELECT id FROM leads WHERE id=? AND owner_id=?", [id, ownerId])
  if (!lead) return null
  return sendQuote(db, id, ownerId, opts)
}

export async function addNote(db: D1Database, id: string, ownerId: string, text: string) {
  const lead = await queryOne<any>(db, "SELECT id FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId])
  if (!lead) return null
  await execute(db, "UPDATE leads SET last_activity_at = ?, updated_at = ? WHERE id = ?", [now(), now(), id])
  await logEvent(db, id, ownerId, "note", "", text)
  return { ok: true }
}

export async function logTouch(db: D1Database, id: string, ownerId: string, type: string, channel = "", detail = "") {
  const lead = await queryOne<any>(db, "SELECT id, first_touch_at FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId])
  if (!lead) return null
  const sets = ["last_activity_at = ?", "updated_at = ?"]
  const vals: any[] = [now(), now()]
  if (!lead.firstTouchAt && !lead.first_touch_at) { sets.push("first_touch_at = ?"); vals.push(now()) }
  vals.push(id)
  await execute(db, `UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, vals)
  await logEvent(db, id, ownerId, type, channel, detail || `Logged ${type}`)
  return { ok: true }
}

export async function deleteLead(db: D1Database, id: string, ownerId: string) {
  const r = await execute(db, "DELETE FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId])
  return !!r.meta?.changes
}

// ─── internals ───────────────────────────────────────────────────
async function logEvent(db: D1Database, leadId: string, agentId: string, type: string, channel: string, detail: string) {
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    [newId(), leadId, agentId, type, channel, detail, now()])
}

function shapeLead(r: any) {
  return {
    id: r.id,
    name: r.contactName || r.contact_name || "",
    phone: r.phone || "",
    email: r.email || "",
    channel: r.source || "",
    country: r.country || "",
    handle: r.handle || "",
    stage: normStage(r.stage),
    state: r.state,
    destination: r.destination || "",
    travelType: r.tripType || r.trip_type || "",
    travelDate: r.travelDate || r.travel_date || null,
    pax: r.pax || 1,
    adults: (r.adults ?? null) === null ? null : Number(r.adults),
    children: (r.children ?? null) === null ? null : Number(r.children),
    childrenAges: (() => { try { return JSON.parse(r.childrenAges || r.children_ages || "[]") } catch { return [] } })(),
    travelDuration: r.travelDuration || r.travel_duration || "",
    budget: r.budget ?? null,
    budgetText: r.budgetText || r.budget_text || (r.budget ? `₹ ${Number(r.budget).toLocaleString("en-IN")}` : ""),
    score: r.score || 0,
    temperature: r.temperature || "cold",
    attempts: r.attempts || 0,
    interestedSub: r.interestedSub || r.interested_sub || null,
    lostReason: r.lostReason || r.lost_reason || null,
    bookedValue: r.bookedValue || r.booked_value || "",
    followUpAt: r.followUpAt || r.follow_up_at || null,
    meetingAt: r.meetingAt || r.meeting_at || null,
    receivedOn: r.capturedAt || r.captured_at || r.createdAt || r.created_at,
    updatedAt: r.updatedAt || r.updated_at,
    // Module N — quote SLA status
    quoteSlaStartedAt: r.quoteSlaStartedAt || r.quote_sla_started_at || null,
    quoteDueAt: r.quoteDueAt || r.quote_due_at || null,
    quoteSentAt: r.quoteSentAt || r.quote_sent_at || null,
    quoteBreached: !!(r.quoteBreached || r.quote_breached),
    quoteTransfers: r.quoteTransfers || r.quote_transfers || 0,
    // Booking Date Not Confirmed (safe build)
    estimatedDate: r.estimatedDate || r.estimated_date || null,
    estimatedGranularity: r.estimatedGranularity || r.estimated_granularity || null,
    dateConfirmed: !!(r.dateConfirmed || r.date_confirmed),
    lockDueAt: r.lockDueAt || r.lock_due_at || null,
    lockNudgeCount: r.lockNudgeCount || r.lock_nudge_count || 0,
    bduFlagged: !!(r.bduFlagged || r.bdu_flagged),
  }
}

// IST (UTC+5:30) date key YYYY-MM-DD for "today" comparisons.
function istDateKey(iso?: string | null): string {
  const base = iso ? new Date(iso) : new Date()
  return new Date(base.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}
