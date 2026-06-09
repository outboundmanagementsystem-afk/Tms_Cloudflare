"use client"

// Today's Work — the CRM (SalesFlow) 3-column working board: New Leads · Follow ·
// Pending Quotation. Channel filters, per-column sort/sub-tabs, Board/List toggle.
// Reads the rep's own leads from real D1 (/api/crm/leads); clicking a card opens the
// shared lead drawer. Manual "Add Lead" included.

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useCallback } from "react"
import { Search, Plus, LayoutGrid, List } from "lucide-react"
import { LeadDrawer, AddLead, INK, INK2, INK3, GREEN, LINE, TEMP, relTime, fmtTime } from "@/components/crm/crm-shared"

const CH = [
  { id: "ALL", label: "All", short: "" },
  { id: "instagram", label: "Instagram", short: "IG" },
  { id: "whatsapp", label: "WhatsApp", short: "WA" },
  { id: "tiktok", label: "TikTok", short: "TT" },
  { id: "fb_ads", label: "FB Ads", short: "FBa" },
  { id: "facebook", label: "Facebook", short: "FB" },
  { id: "google", label: "Google", short: "GA" },
  { id: "youtube", label: "YouTube", short: "YT" },
  { id: "direct", label: "Direct", short: "DR" },
]
const chLabel = (id: string) => CH.find((c) => c.id === id)?.label || id

// Quote Given = quote already sent → it belongs in Follow (follow-up), not Pending Quotation.
// Pending Quotation holds only quotes still being prepared (PENDING_QUOTE).
const FOLLOW_STAGES = ["CALLBACK", "NOT_ATTENDED", "NO_RESPONSE", "IN_DISCUSSION", "BOOKING_POTENTIAL", "QUOTE_GIVEN", "CTW", "CNW", "BOOMERANG"]
const QUOTE_STAGES = ["PENDING_QUOTE"]
const FOLLOW_TABS: [string, string][] = [
  ["all", "All"], ["not_attended", "Not Answered"], ["no_response", "Not Reachable"],
  ["scheduled", "Scheduled"], ["potential", "Potential"], ["unconfirmed", "Unconfirmed"],
]

export default function TodaysWorkPage() {
  return (
    <ProtectedRoute allowedRoles={["sales", "sales_lead"]}>
      <TodaysWork />
    </ProtectedRoute>
  )
}

function TodaysWork() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [mode, setMode] = useState<"board" | "list">("board")
  const [q, setQ] = useState("")
  // per-column filter state
  const [newSort, setNewSort] = useState("oldest")
  const [newAge, setNewAge] = useState("ALL")
  const [followTab, setFollowTab] = useState("all")
  const [followSort, setFollowSort] = useState("soonest")
  const [quoteSort, setQuoteSort] = useState("newest")

  const load = useCallback(async () => {
    const r = await fetch("/api/crm/leads", { cache: "no-store" })
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 40, color: INK2 }}>Loading your day…</div>

  const columns: Record<string, any[]> = data?.columns || {}
  const flat = (ids: string[]) => ids.flatMap((id) => columns[id] || [])
  const matchF = (l: any) =>
    (!q || [l.name, l.destination, l.phone].join(" ").toLowerCase().includes(q.toLowerCase()))

  // New Leads column
  let colNew = (columns["NEW"] || []).filter(matchF)
  if (newAge !== "ALL") {
    const hr = 3600_000, n = Date.now()
    colNew = colNew.filter((l) => {
      const age = n - new Date(l.receivedOn).getTime()
      return newAge === "1h" ? age < hr : newAge === "4h" ? age < 4 * hr : age < 24 * hr
    })
  }
  colNew.sort((a, b) => {
    const t = (x: any) => new Date(x.receivedOn).getTime()
    return newSort === "oldest" ? t(a) - t(b) : t(b) - t(a)
  })

  // Follow column
  let colFollow = flat(FOLLOW_STAGES).filter(matchF)
  if (followTab === "not_attended") colFollow = colFollow.filter((l) => l.stage === "NOT_ATTENDED")
  else if (followTab === "no_response") colFollow = colFollow.filter((l) => l.stage === "NO_RESPONSE")
  else if (followTab === "scheduled") colFollow = colFollow.filter((l) => l.stage === "CALLBACK" || l.stage === "BOOMERANG")
  else if (followTab === "potential") colFollow = colFollow.filter((l) => l.stage === "IN_DISCUSSION" || l.stage === "BOOKING_POTENTIAL" || l.stage === "QUOTE_GIVEN")
  else if (followTab === "unconfirmed") colFollow = colFollow.filter((l) => l.stage === "CTW" || l.stage === "CNW")
  const fTime = (l: any) => new Date(l.followUpAt || l.meetingAt || l.receivedOn).getTime()
  colFollow.sort((a, b) => followSort === "soonest" ? fTime(a) - fTime(b) : fTime(b) - fTime(a))

  // Pending Quotation column
  let colQuote = flat(QUOTE_STAGES).filter(matchF)
  colQuote.sort((a, b) => {
    const t = (x: any) => new Date(x.receivedOn).getTime()
    return quoteSort === "newest" ? t(b) - t(a) : t(a) - t(b)
  })

  const sel = "text-xs rounded-lg border px-2 py-1.5 outline-none"

  return (
    <div style={{ padding: "8px 4px" }}>
      <h1 className="text-2xl font-bold mb-3" style={{ color: INK }}>Today&apos;s Work</h1>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
          <Search className="w-4 h-4" style={{ color: INK3 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search today…" className="text-sm outline-none bg-transparent" style={{ width: 150, color: INK }} />
        </div>
        <div className="flex-1" />
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
          <button onClick={() => setMode("board")} className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1" style={{ background: mode === "board" ? GREEN : "#fff", color: mode === "board" ? "#fff" : INK2 }}><LayoutGrid className="w-3.5 h-3.5" /> Board</button>
          <button onClick={() => setMode("list")} className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1" style={{ background: mode === "list" ? GREEN : "#fff", color: mode === "list" ? "#fff" : INK2 }}><List className="w-3.5 h-3.5" /> List</button>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#0f7a4a,#06a15c)" }}>
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Today summary */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm font-bold" style={{ color: INK2 }}>Today:</span>
        <Chip color={GREEN} label="New" n={colNew.length} icon="🟣" />
        <Chip color="#d4a017" label="Follow" n={colFollow.length} icon="📅" />
        <Chip color="#0e9488" label="Quotes" n={colQuote.length} icon="📝" />
      </div>

      {mode === "list" ? (
        <ListView groups={[["🟣 New Leads", colNew], ["📅 Follow", colFollow], ["📝 Pending Quotation", colQuote]]} onOpen={setOpenId} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {/* New Leads */}
          <Column title="🟣 New Leads" accent={GREEN} count={colNew.length} badge="⏱ Callback" badgeColor="#d4a017">
            <div className="flex gap-1.5 mb-2">
              <select className={sel} style={{ borderColor: LINE, color: INK2 }} value={newSort} onChange={(e) => setNewSort(e.target.value)}>
                <option value="oldest">🕒 Oldest</option><option value="newest">🕒 Newest</option>
              </select>
              <select className={sel} style={{ borderColor: LINE, color: INK2 }} value={newAge} onChange={(e) => setNewAge(e.target.value)}>
                <option value="ALL">All Leads</option><option value="1h">&lt; 1 Hr</option><option value="4h">&lt; 4 Hrs</option><option value="24h">&lt; 24 Hrs</option>
              </select>
            </div>
            {cards(colNew, setOpenId, "No new leads.")}
          </Column>

          {/* Follow */}
          <Column title="📅 Follow" accent="#d4a017" count={colFollow.length} badge="⏱ Callback" badgeColor="#d4a017">
            <div className="flex flex-wrap gap-1 mb-2">
              {FOLLOW_TABS.map(([id, lab]) => (
                <button key={id} onClick={() => setFollowTab(id)} className="text-[11px] px-2 py-1 rounded-md font-medium"
                  style={{ background: followTab === id ? GREEN : "rgba(15,31,23,0.05)", color: followTab === id ? "#fff" : INK2 }}>{lab}</button>
              ))}
            </div>
            <select className={sel + " mb-2"} style={{ borderColor: LINE, color: INK2 }} value={followSort} onChange={(e) => setFollowSort(e.target.value)}>
              <option value="soonest">🕒 Soonest</option><option value="latest">🕒 Latest</option>
            </select>
            {cards(colFollow, setOpenId, "All caught up!")}
          </Column>

          {/* Pending Quotation */}
          <Column title="📝 Pending Quotation" accent="#0e9488" count={colQuote.length} badge="♡ Interested" badgeColor={GREEN}>
            <select className={sel + " mb-2"} style={{ borderColor: LINE, color: INK2 }} value={quoteSort} onChange={(e) => setQuoteSort(e.target.value)}>
              <option value="newest">🕒 Newest</option><option value="oldest">🕒 Oldest</option>
            </select>
            {cards(colQuote, setOpenId, "No quotes pending.")}
          </Column>
        </div>
      )}

      {showAdd && <AddLead onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function cards(list: any[], onOpen: (id: string) => void, empty: string) {
  if (!list.length) return <div className="text-sm text-center py-8" style={{ color: INK3 }}><span className="block text-lg mb-1">✓</span>{empty}</div>
  return <div className="space-y-2">{list.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => onOpen(l.id)} />)}</div>
}

function Column({ title, accent, count, badge, badgeColor, children }: any) {
  return (
    <div className="flex-shrink-0 rounded-xl flex flex-col" style={{ width: 300, background: "rgba(15,31,23,0.02)", border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl" style={{ background: "#fff", borderBottom: `2px solid ${accent}` }}>
        <h3 className="text-sm font-bold" style={{ color: INK }}>{title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${accent}1a`, color: accent }}>{count}</span>
        {badge && <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${badgeColor}1a`, color: badgeColor }}>{badge}</span>}
      </div>
      <div className="p-2.5">{children}</div>
    </div>
  )
}

function Chip({ color, label, n, icon }: any) {
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: `${color}1a`, color }}>
      {icon} {label} <b>{n}</b>
    </span>
  )
}

function LeadCard({ lead, onOpen }: any) {
  let meta = `🕒 ${relTime(lead.receivedOn)}`
  if (["CALLBACK", "NOT_ATTENDED", "NO_RESPONSE", "BOOMERANG"].includes(lead.stage) && lead.followUpAt) meta = `📅 Due ${fmtTime(lead.followUpAt)} · ${relTime(lead.followUpAt)}`
  if (["IN_DISCUSSION", "BOOKING_POTENTIAL", "CTW", "CNW"].includes(lead.stage)) meta = `💎 ${lead.interestedSub || "Interested"}${lead.budgetText ? ` · ${lead.budgetText}` : ""}`
  if (lead.stage === "QUOTE_GIVEN") meta = `📄 Quote sent${lead.budgetText ? ` · ${lead.budgetText}` : ""}`
  return (
    <div onClick={onOpen} className="rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TEMP[lead.temperature] || "#999" }} />
        <span className="text-sm font-semibold truncate" style={{ color: INK }}>{lead.name || lead.phone || "New lead"}</span>
        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(212,160,23,0.12)", color: "#9a7400" }}>{chLabel(lead.channel)}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Tag>✈ {lead.destination || "—"}</Tag>
        {lead.travelType && <Tag>{lead.travelType}</Tag>}
        <Tag>👤 {lead.pax}</Tag>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: INK2 }}>
        <span>{meta}</span>
        {lead.attempts > 0 && <span className="ml-auto" style={{ color: "#e07856" }}>☎ {lead.attempts} attempt{lead.attempts > 1 ? "s" : ""}</span>}
      </div>
    </div>
  )
}
function Tag({ children }: any) {
  return <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: "rgba(15,31,23,0.05)", color: INK2 }}>{children}</span>
}

function ListView({ groups, onOpen }: { groups: [string, any[]][]; onOpen: (id: string) => void }) {
  const total = groups.reduce((n, [, l]) => n + l.length, 0)
  if (!total) return <div className="text-center py-16" style={{ color: INK3 }}><div className="text-2xl mb-2">☀</div>All caught up — no tasks for today.</div>
  return (
    <div className="space-y-5">
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title}>
          <div className="text-sm font-bold mb-2" style={{ color: INK }}>{title} <span style={{ color: INK3 }}>· {list.length}</span></div>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
            {list.map((l) => (
              <div key={l.id} onClick={() => onOpen(l.id)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" style={{ borderBottom: `1px solid ${LINE}` }}>
                <span className="w-2 h-2 rounded-full" style={{ background: TEMP[l.temperature] || "#999" }} />
                <span className="text-sm font-semibold w-40 truncate" style={{ color: INK }}>{l.name || l.phone}</span>
                <span className="text-xs" style={{ color: INK2 }}>✈ {l.destination || "—"} · 👤 {l.pax}</span>
                <span className="text-xs" style={{ color: INK3 }}>{chLabel(l.channel)}</span>
                <span className="ml-auto text-xs" style={{ color: INK2 }}>{l.budgetText || ""}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
