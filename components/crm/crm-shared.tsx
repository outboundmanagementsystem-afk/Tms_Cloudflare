"use client"

// Shared CRM (SalesFlow) UI — the lead drawer (overview / history / notes / documents +
// the callback/interested/not-interested workflow) and the manual Add-Lead modal.
// Used by both "All Leads" (Kanban) and "Today's Work" (board). Everything reads/writes
// the real owner-scoped /api/crm/* endpoints.

import { useEffect, useState, useCallback, useRef } from "react"
import {
  X, Phone, MessageCircle, Mail, Clock, CalendarDays, MapPin, Users2, Wallet,
  Upload, FileText, Trash2, Download, Target, Send, AlertTriangle,
} from "lucide-react"

export const INK = "#0f1f17", INK2 = "rgba(15,31,23,0.55)", INK3 = "rgba(15,31,23,0.4)", GREEN = "#06a15c", LINE = "rgba(15,31,23,0.08)"
export const TEMP: Record<string, string> = { hot: "#ef4444", warm: "#f59e0b", cold: "#3b82f6" }
export const CHANNELS = ["instagram", "whatsapp", "tiktok", "fb_ads", "facebook", "google", "youtube", "direct"]
export const COUNTRIES = [{ id: "AE", label: "UAE", dial: "+971" }, { id: "IN", label: "India", dial: "+91" }, { id: "SA", label: "Saudi", dial: "+966" }, { id: "OM", label: "Oman", dial: "+968" }, { id: "US", label: "USA/Canada", dial: "+1" }, { id: "QA", label: "Qatar", dial: "+974" }]
export const dialFor = (countryId: string) => COUNTRIES.find((c) => c.id === countryId)?.dial || ""
export const TRAVEL_TYPES = ["Honeymoon", "Family", "Group Tour", "Solo", "Business", "Adventure", "Luxury"]
export const INTERESTED_SUBS = ["Pending Quotes", "Quote Given", "Booking Potential"]

// The sales pipeline stages (client copy — for drawer chip display).
export const STAGES_UI: { id: string; label: string; icon: string; accent: string }[] = [
  { id: "NEW", label: "New", icon: "🟣", accent: "#06a15c" },
  { id: "CALLBACK", label: "Call Back", icon: "📞", accent: "#d4a017" },
  { id: "NOT_ATTENDED", label: "Not Attended", icon: "⏳", accent: "#d4a017" },
  { id: "NOT_INTERESTED", label: "Not Interested", icon: "✋", accent: "#e07856" },
  { id: "PENDING_QUOTE", label: "Pending Quote", icon: "📝", accent: "#0e9488" },
  { id: "QUOTE_GIVEN", label: "Quote Given", icon: "📄", accent: "#0e9488" },
  { id: "BOOKING_POTENTIAL", label: "Booking Potential", icon: "💎", accent: "#0e9488" },
  { id: "IN_DISCUSSION", label: "In Discussion", icon: "💬", accent: "#0e9488" },
  { id: "CTW", label: "CTW", icon: "🔥", accent: "#d4a017" },
  { id: "CNW", label: "CNW", icon: "📆", accent: "#d4a017" },
  { id: "NO_RESPONSE", label: "No Response", icon: "🔕", accent: "#d4a017" },
  { id: "BOOMERANG", label: "Boomerang", icon: "🔄", accent: "#0e9488" },
  { id: "BOOKING_DATE_UNCONFIRMED", label: "Date Not Confirmed", icon: "📅", accent: "#7c3aed" },
  { id: "WON", label: "Won", icon: "🏆", accent: "#06a15c" },
  { id: "LOST", label: "Lost", icon: "❌", accent: "#e07856" },
]

export function fmtShort(iso: string) { try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) } catch { return "" } }
export function fmtLong(iso: string) { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) } catch { return "" } }
export function fmtTime(iso: string) { try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) } catch { return "" } }
export function fmtBytes(n: number) { if (!n) return "0 B"; const k = 1024, u = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(n) / Math.log(k)); return `${(n / Math.pow(k, i)).toFixed(1)} ${u[i]}` }
export function relTime(iso: string) {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); return `${d}d ago`
}

// ─────────────────────────── Lead drawer ───────────────────────────
export function LeadDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [lead, setLead] = useState<any>(null)
  const [tab, setTab] = useState("overview")
  const [panel, setPanel] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/leads/${id}`, { cache: "no-store" })
    if (r.ok) setLead(await r.json())
  }, [id])
  useEffect(() => { load() }, [load])

  async function act(body: any) {
    await fetch(`/api/crm/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setPanel(null); await load(); onChanged()
  }
  async function touch(type: string) {
    await fetch(`/api/crm/leads/${id}/touch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) })
    await load(); onChanged()
  }
  async function note(text: string) {
    await fetch(`/api/crm/leads/${id}/note`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
    await load()
  }
  async function upload(file: File) {
    const fd = new FormData(); fd.append("file", file)
    await fetch(`/api/crm/leads/${id}/docs`, { method: "POST", body: fd }); await load()
  }
  async function delDoc(docId: string) { await fetch(`/api/crm/docs/${docId}`, { method: "DELETE" }); await load() }
  async function quote(action: string, extra: any = {}) {
    await fetch(`/api/crm/leads/${id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) })
    await load(); onChanged()
  }
  async function bookingDate(action: string, extra: any = {}) {
    const r = await fetch(`/api/crm/leads/${id}/booking-date`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) })
    const d = await r.json().catch(() => ({}))
    if (d?.error) alert(d.error)
    else if (d?.expedite) alert(`⚠ Date confirmed, but the runway is only ${d.runwayDays} day(s) — inside the Pre-Ops minimum (${d.preOpsMinDays}d).\n\nRoute this to Pre-Ops as EXPEDITE / urgent. Do NOT skip the Pre-Ops checks.`)
    await load(); onChanged()
  }

  const st = STAGES_UI.find((s) => s.id === lead?.stage)

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full z-50 flex flex-col" style={{ width: "min(480px,100vw)", background: "#fff", boxShadow: "-8px 0 30px rgba(0,0,0,0.12)" }}>
        {!lead ? <div style={{ padding: 40, color: INK2 }}>Loading…</div> : (
          <>
            <div className="p-5" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEMP[lead.temperature] }} />
                    <h2 className="text-xl font-bold truncate" style={{ color: INK }}>{lead.name || "New lead"}</h2>
                  </div>
                  <div className="text-sm mt-0.5" style={{ color: INK2 }}>{lead.phone} {lead.email ? `· ${lead.email}` : ""}</div>
                  {st && <span className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `${st.accent}1a`, color: st.accent }}>{st.icon} {st.label}</span>}
                </div>
                <button onClick={onClose}><X className="w-5 h-5" style={{ color: INK3 }} /></button>
              </div>
              <div className="flex gap-2 mt-4">
                <Circle icon={<MessageCircle className="w-4 h-4" />} label="WhatsApp" onClick={() => touch("whatsapp")} />
                <Circle icon={<Phone className="w-4 h-4" />} label="Call" onClick={() => touch("call")} />
                <Circle icon={<Mail className="w-4 h-4" />} label="Email" onClick={() => touch("email")} />
              </div>
            </div>

            <div className="flex gap-1 px-3 pt-3" style={{ borderBottom: `1px solid ${LINE}` }}>
              {["overview", "history", "notes", "documents"].map((t) => (
                <button key={t} onClick={() => setTab(t)} className="px-3 py-2 text-sm font-medium capitalize rounded-t-lg"
                  style={{ color: tab === t ? GREEN : INK2, borderBottom: tab === t ? `2px solid ${GREEN}` : "2px solid transparent" }}>{t}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === "overview" && <Overview lead={lead} onStage={(s: string) => act({ stage: s })} />}
              {tab === "history" && <History lead={lead} />}
              {tab === "notes" && <Notes lead={lead} onAdd={note} />}
              {tab === "documents" && <Documents lead={lead} fileRef={fileRef} onUpload={upload} onDelete={delDoc} />}
            </div>

            {/* Booking Date Not Confirmed (safe build) */}
            {lead.stage === "BOOKING_DATE_UNCONFIRMED"
              ? <BookingDatePanel lead={lead} onBooking={bookingDate} />
              : !lead.dateConfirmed && lead.stage !== "WON" && lead.stage !== "LOST" && (
                <button
                  onClick={() => { const v = prompt("Client committed to book but no exact date.\nEnter the ESTIMATED travel date (YYYY-MM-DD):"); if (v) bookingDate("enter", { estimatedDate: v }) }}
                  className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2" style={{ color: "#7c3aed", borderTop: `1px solid ${LINE}` }}>
                  📅 Mark: booking date not confirmed
                </button>
              )}

            {/* Module N — Pending Quotes SLA */}
            {lead.quoteSlaStartedAt && !lead.quoteSentAt && <QuotePanel lead={lead} onQuote={quote} />}
            {lead.quoteSentAt && (
              <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(6,161,92,0.08)", color: GREEN, borderTop: `1px solid ${LINE}` }}>
                <Send className="w-3.5 h-3.5" /> Quote sent — in follow-up
              </div>
            )}

            <div className="p-4" style={{ borderTop: `1px solid ${LINE}`, background: "rgba(15,31,23,0.015)" }}>
              {!panel ? (
                // A NEW lead can be triaged 3 ways. Once it has moved into the pipeline,
                // the only quick action left is to drop it (Not Interested); stage changes
                // are then done via the Stage dropdown in Overview.
                lead.stage === "NEW" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <WBtn label="⏱ Callback" color="#d4a017" onClick={() => setPanel("callback")} />
                    <WBtn label="♡ Interested" color={GREEN} onClick={() => setPanel("interested")} />
                    <WBtn label="⊘ Not Interested" color="#e07856" onClick={() => setPanel("notint")} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1">
                    <WBtn label="⊘ Not Interested" color="#e07856" onClick={() => setPanel("notint")} />
                  </div>
                )
              ) : (
                <ActionPanel kind={panel} onCancel={() => setPanel(null)} onConfirm={act} />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function Circle({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(6,161,92,0.1)", color: GREEN }}>{icon}</span>
      <span className="text-[10px]" style={{ color: INK2 }}>{label}</span>
    </button>
  )
}
function WBtn({ label, color, onClick }: any) {
  return <button onClick={onClick} className="py-2.5 rounded-lg text-xs font-semibold" style={{ background: `${color}1a`, color }}>{label}</button>
}

function Overview({ lead, onStage }: any) {
  return (
    <div className="space-y-3">
      <Row icon={<MapPin className="w-4 h-4" />} label="Destination" value={lead.destination || "—"} />
      <Row icon={<Target className="w-4 h-4" />} label="Travel type" value={lead.travelType || "—"} />
      <Row icon={<Users2 className="w-4 h-4" />} label="Pax" value={paxLabel(lead)} />
      <Row icon={<Wallet className="w-4 h-4" />} label="Budget" value={lead.budgetText || "—"} />
      <Row icon={<CalendarDays className="w-4 h-4" />} label="Travel date" value={lead.travelDate ? fmtShort(lead.travelDate) : "—"} />
      <Row icon={<Clock className="w-4 h-4" />} label="Duration" value={lead.travelDuration || "—"} />
      <Row icon={<Clock className="w-4 h-4" />} label="Next follow-up" value={lead.followUpAt ? fmtLong(lead.followUpAt) : "—"} />
      <StageSelectRow stage={lead.stage} onStage={onStage} />
      <div className="grid grid-cols-3 gap-2 pt-1">
        <Mini label="Channel" value={lead.channel} />
        <Mini label="Country" value={lead.country || "—"} />
        <Mini label="Attempts" value={String(lead.attempts || 0)} />
      </div>
      <div className="text-[11px] pt-1" style={{ color: INK3 }}>Received {fmtLong(lead.receivedOn)}</div>
    </div>
  )
}
function Row({ icon, label, value }: any) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: INK3 }}>{icon}</span>
      <span className="text-sm" style={{ color: INK2, width: 110 }}>{label}</span>
      <span className="text-sm font-medium flex-1 text-right" style={{ color: INK }}>{value}</span>
    </div>
  )
}
// "3 (2A · 1C · 1 infant)" — total with adults/children/infant breakdown when available.
function paxLabel(lead: any) {
  const total = lead.pax || ((lead.adults || 0) + (lead.children || 0)) || 1
  if (lead.adults == null && lead.children == null) return String(total)
  const ages: number[] = Array.isArray(lead.childrenAges) ? lead.childrenAges : []
  const infants = ages.filter((a) => a <= 2).length
  const parts: string[] = []
  if (lead.adults) parts.push(`${lead.adults}A`)
  const kids = (lead.children || 0) - infants
  if (kids > 0) parts.push(`${kids}C`)
  if (infants > 0) parts.push(`${infants} infant${infants > 1 ? "s" : ""}`)
  return parts.length ? `${total} (${parts.join(" · ")})` : String(total)
}
// Curated pipeline stages for the All Leads Kanban columns. "No Response" shows as
// "Not Reachable"; Not Interested, In Discussion, CTW, CNW and Boomerang are omitted.
// "Lost" stays — clicking "Not Interested" moves the lead into the Lost column.
export const STAGE_OPTIONS: { id: string; label: string; icon: string; accent: string }[] = [
  { id: "NEW", label: "New", icon: "🟣", accent: "#06a15c" },
  { id: "CALLBACK", label: "Call Back", icon: "📞", accent: "#d4a017" },
  { id: "NOT_ATTENDED", label: "Not Attended", icon: "⏳", accent: "#d4a017" },
  { id: "NO_RESPONSE", label: "Not Reachable", icon: "🔕", accent: "#d4a017" },
  { id: "PENDING_QUOTE", label: "Pending Quote", icon: "📝", accent: "#0e9488" },
  { id: "QUOTE_GIVEN", label: "Quote Given", icon: "📄", accent: "#0e9488" },
  { id: "BOOKING_POTENTIAL", label: "Booking Potential", icon: "💎", accent: "#0e9488" },
  { id: "BOOKING_DATE_UNCONFIRMED", label: "Date Not Confirmed", icon: "📅", accent: "#7c3aed" },
  { id: "WON", label: "Won", icon: "🏆", accent: "#06a15c" },
  { id: "LOST", label: "Lost", icon: "❌", accent: "#e07856" },
]
// Stage row rendered as a dropdown so a rep can move the lead across pipelines.
// Once a lead has left NEW (e.g. a quote was sent → Quote Given) it can never be
// set back to NEW — that option drops out of the list.
function StageSelectRow({ stage, onStage }: { stage: string; onStage?: (s: string) => void }) {
  // Lost is reached via the "Not Interested" button, not the dropdown; New disappears
  // once the lead has progressed.
  const opts = STAGE_OPTIONS.filter((o) => o.id !== "LOST" && (o.id !== "NEW" || stage === "NEW"))
  const known = opts.some((o) => o.id === stage)
  const cur = STAGES_UI.find((s) => s.id === stage)
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: INK3 }}><Target className="w-4 h-4" /></span>
      <span className="text-sm" style={{ color: INK2, width: 110 }}>Stage</span>
      <select
        value={stage}
        onChange={(e) => onStage?.(e.target.value)}
        className="text-sm font-medium flex-1 rounded-lg px-2 py-1.5 border outline-none"
        style={{ borderColor: LINE, color: INK, background: "#fff" }}>
        {/* Keep the lead's real current stage visible even if it isn't in the curated list. */}
        {!known && <option value={stage}>{cur ? `${cur.icon} ${cur.label}` : stage}</option>}
        {opts.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.label}</option>)}
      </select>
    </div>
  )
}
function Mini({ label, value }: any) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(15,31,23,0.04)" }}>
      <div className="text-sm font-semibold capitalize" style={{ color: INK }}>{value}</div>
      <div className="text-[10px]" style={{ color: INK3 }}>{label}</div>
    </div>
  )
}
function History({ lead }: any) {
  const h = lead.history || []
  if (!h.length) return <Empty text="No activity yet." />
  return (
    <div className="space-y-2">
      {h.map((e: any) => (
        <div key={e.id} className="flex gap-3 text-sm">
          <span className="text-xs mt-0.5 px-1.5 py-0.5 rounded uppercase font-bold" style={{ background: "rgba(15,31,23,0.05)", color: INK3 }}>{e.type === "status_change" ? "stage" : e.type}</span>
          <div className="flex-1">
            <div style={{ color: INK }}>{e.detail}</div>
            <div className="text-[11px]" style={{ color: INK3 }}>{fmtLong(e.at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
function Notes({ lead, onAdd }: any) {
  const [t, setT] = useState("")
  const notes = lead.notes || []
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a note…" className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: LINE }} />
        <button onClick={() => { if (t.trim()) { onAdd(t.trim()); setT("") } }} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: GREEN }}>Add</button>
      </div>
      {notes.length === 0 ? <Empty text="No notes." /> : (
        <div className="space-y-2">
          {notes.map((n: any) => (
            <div key={n.id} className="rounded-lg p-2.5" style={{ background: "rgba(15,31,23,0.04)" }}>
              <div className="text-sm" style={{ color: INK }}>{n.text}</div>
              <div className="text-[11px] mt-1" style={{ color: INK3 }}>{fmtLong(n.at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
function Documents({ lead, fileRef, onUpload, onDelete }: any) {
  const docs = lead.documents || []
  return (
    <div>
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = "" }} />
      <button onClick={() => fileRef.current?.click()} className="w-full mb-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "rgba(6,161,92,0.1)", color: GREEN, border: `1px dashed ${GREEN}` }}>
        <Upload className="w-4 h-4" /> Upload document
      </button>
      {docs.length === 0 ? <Empty text="No documents — upload quotes, passports, vouchers." /> : (
        <div className="space-y-2">
          {docs.map((d: any) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg p-2.5" style={{ background: "rgba(15,31,23,0.04)" }}>
              <FileText className="w-4 h-4" style={{ color: GREEN }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: INK }}>{d.name}</div>
                <div className="text-[10px]" style={{ color: INK3 }}>{fmtBytes(d.size)} · {fmtShort(d.at)}</div>
              </div>
              <a href={`/api/crm/docs/${d.id}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-md" style={{ color: GREEN }}><Download className="w-4 h-4" /></a>
              <button onClick={() => onDelete(d.id)} className="p-1.5 rounded-md" style={{ color: "#ef4444" }}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionPanel({ kind, onCancel, onConfirm }: any) {
  const [sub, setSub] = useState("")
  const [note, setNote] = useState("")
  const [chip, setChip] = useState("")
  const [custom, setCustom] = useState("")

  const followUpAt = () => {
    if (custom) return new Date(custom).toISOString()
    if (chip) {
      const d = new Date()
      if (chip === "1h") d.setHours(d.getHours() + 1)
      else if (chip === "2h") d.setHours(d.getHours() + 2)
      else if (chip === "4h") d.setHours(d.getHours() + 4)
      else if (chip === "eod") d.setHours(18, 0, 0, 0)
      return d.toISOString()
    }
    return null
  }
  function confirm() {
    if (kind === "callback") {
      if (!note.trim()) return alert("Add a reason.")
      if (!chip && !custom) return alert("Pick a follow-up time — it is required.")
      onConfirm({ action: "callback", sub, note: note.trim(), followUpAt: followUpAt() })
    } else if (kind === "interested") {
      if (!sub) return alert("Pick an option.")
      onConfirm({ action: "interested", sub, note: note.trim(), followUpAt: followUpAt() })
    } else {
      if (!note.trim()) return alert("Add a reason.")
      onConfirm({ action: "notint", sub: sub || "Archive", note: note.trim(), reason: note.trim() })
    }
  }

  const subs = kind === "callback" ? ["Not Answered", "Not Reachable", "Follow-up Date"]
    : kind === "interested" ? INTERESTED_SUBS
    : ["Archive (Lost)", "Mark DND"]

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: INK }}>{kind === "callback" ? "Callback" : kind === "interested" ? "Interested" : "Not Interested"}</span>
        <button onClick={onCancel} className="text-xs" style={{ color: INK3 }}>Cancel</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {subs.map((s) => (
          <button key={s} onClick={() => setSub(s)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: sub === s ? GREEN : "rgba(15,31,23,0.05)", color: sub === s ? "#fff" : INK2 }}>{s}</button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "notint" ? "Reason (required)…" : "Note / reason (optional)…"} rows={2} className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: LINE }} />
      {kind !== "notint" && (
        <div>
          <div className="text-[11px] mb-1 font-medium" style={{ color: INK2 }}>Next follow-up {kind === "callback" && <span style={{ color: "#ef4444" }}>* required</span>}</div>
          <div className="flex flex-wrap gap-1.5">
            {[["1h", "In 1 Hr"], ["2h", "In 2 Hrs"], ["4h", "In 4 Hrs"], ["eod", "6 PM EOD"]].map(([v, l]) => (
              <button key={v} onClick={() => { setChip(v); setCustom("") }} className="text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: chip === v ? GREEN : "rgba(15,31,23,0.05)", color: chip === v ? "#fff" : INK2 }}>{l}</button>
            ))}
            <input type="datetime-local" value={custom} onChange={(e) => { setCustom(e.target.value); setChip("") }} className="text-xs px-2 py-1.5 rounded-lg border" style={{ borderColor: LINE }} />
          </div>
        </div>
      )}
      <button onClick={confirm} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: GREEN }}>Confirm</button>
    </div>
  )
}

// ─────────────────────────── Add lead modal ───────────────────────────
export function AddLead({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState<any>({ source: "direct", country: "AE", contactName: "", phone: "", email: "", destination: "", tripType: "Family", adults: 2, children: 0, childrenAges: [], travelDuration: "", budgetText: "", travelDate: "", followUpAt: "" })
  const [busy, setBusy] = useState(false)
  // Keep the children-ages array length in sync with the child count.
  function setChildren(n: number) {
    const children = Math.max(0, n || 0)
    const ages = Array.from({ length: children }, (_, i) => f.childrenAges?.[i] ?? "")
    setF({ ...f, children, childrenAges: ages })
  }
  function setAge(i: number, v: string) {
    const ages = [...(f.childrenAges || [])]; ages[i] = v
    setF({ ...f, childrenAges: ages })
  }
  async function submit() {
    if (!f.contactName && !f.phone) return alert("Enter a name or phone.")
    const adults = Math.max(1, Number(f.adults) || 1)
    const children = Math.max(0, Number(f.children) || 0)
    const childrenAges = (f.childrenAges || []).slice(0, children).map((a: any) => Math.max(0, Number(a) || 0))
    // Prepend the selected country's dial code to the phone (unless already prefixed).
    const dial = dialFor(f.country)
    const rawPhone = (f.phone || "").trim()
    const phone = rawPhone && dial && !rawPhone.startsWith("+") ? `${dial} ${rawPhone.replace(/^0+/, "")}` : rawPhone
    setBusy(true)
    await fetch("/api/crm/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f, phone, adults, children, childrenAges, pax: adults + children,
        travelDuration: (f.travelDuration || "").trim(),
        travelDate: f.travelDate || null,
        followUpAt: f.followUpAt ? new Date(f.followUpAt).toISOString() : null,
      }),
    })
    setBusy(false); onAdded()
  }
  const inp = "w-full px-3 py-2 rounded-lg text-sm border"
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg" style={{ color: INK }}>Add a lead</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: INK3 }} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={inp + " col-span-2"} style={{ borderColor: LINE }} placeholder="Contact name" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <select className={inp} style={{ borderColor: LINE }} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="flex items-stretch rounded-lg border overflow-hidden" style={{ borderColor: LINE }}>
            <span className="px-2.5 flex items-center text-sm font-medium" style={{ background: "rgba(15,31,23,0.05)", color: INK2 }}>{dialFor(f.country) || "+"}</span>
            <input className="flex-1 px-2 py-2 text-sm outline-none min-w-0" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <input className={inp + " col-span-2"} style={{ borderColor: LINE }} placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <select className={inp} style={{ borderColor: LINE }} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            {CHANNELS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={inp} style={{ borderColor: LINE }} value={f.tripType} onChange={(e) => setF({ ...f, tripType: e.target.value })}>
            {TRAVEL_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={inp} style={{ borderColor: LINE }} placeholder="Destination" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} />
          <input className={inp} style={{ borderColor: LINE }} placeholder="Travel duration (e.g. 3D4N)" value={f.travelDuration} onChange={(e) => setF({ ...f, travelDuration: e.target.value })} />
          <div>
            <div className="text-[11px] mb-1" style={{ color: INK2 }}>Adults</div>
            <input className={inp} style={{ borderColor: LINE }} type="number" min={1} value={f.adults} onChange={(e) => setF({ ...f, adults: e.target.value })} />
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: INK2 }}>Children</div>
            <input className={inp} style={{ borderColor: LINE }} type="number" min={0} value={f.children} onChange={(e) => setChildren(Number(e.target.value))} />
          </div>
          {Number(f.children) > 0 && (
            <div className="col-span-2">
              <div className="text-[11px] mb-1" style={{ color: INK2 }}>Each child — pick Infant (0–2 yrs) or an age</div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: Number(f.children) || 0 }, (_, i) => {
                  const age = f.childrenAges?.[i] ?? ""
                  return (
                    <select key={i} className={inp} style={{ borderColor: LINE }} value={age === "" ? "" : String(age)} onChange={(e) => setAge(i, e.target.value)}>
                      <option value="">Child {i + 1}…</option>
                      <option value="0">👶 Infant (0–2 yrs)</option>
                      {Array.from({ length: 15 }, (_, k) => k + 3).map((a) => <option key={a} value={a}>{a} yrs</option>)}
                    </select>
                  )
                })}
              </div>
            </div>
          )}
          <div>
            <div className="text-[11px] mb-1" style={{ color: INK2 }}>Budget</div>
            <input className={inp} style={{ borderColor: LINE }} placeholder="e.g. AED 14,000" value={f.budgetText} onChange={(e) => setF({ ...f, budgetText: e.target.value })} />
          </div>
          <div>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: INK2 }}><CalendarDays className="w-3 h-3" /> Travel date</div>
            <input className={inp} style={{ borderColor: LINE }} type="date" value={f.travelDate} onChange={(e) => setF({ ...f, travelDate: e.target.value })} />
          </div>
          <div className="col-span-2">
            <div className="text-[11px] mb-1" style={{ color: INK2 }}>First follow-up (optional)</div>
            <input className={inp} style={{ borderColor: LINE }} type="datetime-local" value={f.followUpAt} onChange={(e) => setF({ ...f, followUpAt: e.target.value })} />
          </div>
        </div>
        <button onClick={submit} disabled={busy} className="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: GREEN }}>
          {busy ? "Adding…" : "Add lead"}
        </button>
      </div>
    </div>
  )
}

// Module N — the quote SLA panel inside the drawer. Sending the quote is the ONLY
// thing that stops the clock (FR-QUOTE-2).
function QuotePanel({ lead, onQuote }: { lead: any; onQuote: (action: string, extra?: any) => void }) {
  const breached = !!lead.quoteBreached
  const due = lead.quoteDueAt ? new Date(lead.quoteDueAt) : null
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${LINE}`, background: breached ? "rgba(220,38,38,0.06)" : "rgba(212,160,23,0.06)" }}>
      <div className="flex items-center gap-2 mb-2">
        {breached ? <AlertTriangle className="w-4 h-4" style={{ color: "#dc2626" }} /> : <Clock className="w-4 h-4" style={{ color: "#9a7400" }} />}
        <span className="text-sm font-bold" style={{ color: breached ? "#dc2626" : "#9a7400" }}>
          {breached ? "Quote OVERDUE — send now" : "Quote SLA running"}
        </span>
        {due && <span className="ml-auto text-[11px]" style={{ color: INK2 }}>due {due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
        {lead.quoteTransfers > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(15,31,23,0.06)", color: INK3 }}>transferred ×{lead.quoteTransfers}</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onQuote("send", { channel: "whatsapp" })} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: GREEN }}>
          <Send className="w-4 h-4" /> Send Quote
        </button>
        <button onClick={() => onQuote("send", { failed: true })} className="py-2 px-3 rounded-lg text-xs font-semibold" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }} title="Log a failed/bounced send — SLA continues">Send failed</button>
      </div>
      <div className="text-[10px] mt-1.5" style={{ color: INK3 }}>Only a real send stops the clock — acknowledging or flipping the stage does not.</div>
    </div>
  )
}

// Booking Date Not Confirmed — the panel inside the drawer. Confirming the real date
// is the single source of truth and moves the lead out of the bucket.
function BookingDatePanel({ lead, onBooking }: { lead: any; onBooking: (action: string, extra?: any) => void }) {
  const [date, setDate] = useState("")
  const lockDue = lead.lockDueAt ? new Date(lead.lockDueAt) : null
  const lockDuePast = lockDue ? lockDue.getTime() <= Date.now() : false
  const PURPLE = "#7c3aed"
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${LINE}`, background: lead.bduFlagged ? "rgba(220,38,38,0.06)" : "rgba(124,58,237,0.06)" }}>
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="w-4 h-4" style={{ color: PURPLE }} />
        <span className="text-sm font-bold" style={{ color: PURPLE }}>Booking date not confirmed</span>
        {lead.bduFlagged && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(220,38,38,0.12)", color: "#dc2626" }}>FLAGGED · re-qualify</span>}
      </div>
      <div className="text-xs space-y-1" style={{ color: INK2 }}>
        <div>Estimated: <b style={{ color: INK }}>{lead.estimatedDate || "—"}</b>{lead.estimatedGranularity && lead.estimatedGranularity !== "exact" ? ` (${lead.estimatedGranularity})` : ""}</div>
        <div>Lock-the-date by: <b style={{ color: lockDuePast ? "#dc2626" : INK }}>{lockDue ? lockDue.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</b>{lockDuePast ? " · DUE" : ""} · nudges {lead.lockNudgeCount || 0}</div>
      </div>
      <div className="flex gap-2 mt-2.5">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg text-sm border" style={{ borderColor: LINE }} />
        <button onClick={() => { if (!date) return alert("Pick the exact travel date."); onBooking("confirm", { date }) }} className="px-3 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: GREEN }}>Confirm date</button>
      </div>
      <button onClick={() => { const v = prompt("Update the ESTIMATED travel date (YYYY-MM-DD):", lead.estimatedDate || ""); if (v) onBooking("enter", { estimatedDate: v }) }} className="text-[11px] mt-1.5" style={{ color: INK3 }}>change estimated date</button>
    </div>
  )
}

export function Empty({ text }: { text: string }) { return <div className="text-sm py-6 text-center" style={{ color: INK3 }}>{text}</div> }
