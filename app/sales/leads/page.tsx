"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useCallback, useRef } from "react"
import { Plus, Search, Clock, MapPin, Users2 } from "lucide-react"
import { LeadDrawer, AddLead, STAGE_OPTIONS, INK, INK2, INK3, GREEN, LINE, TEMP, fmtShort } from "@/components/crm/crm-shared"

export default function AllLeadsPage() {
  return (
    <ProtectedRoute allowedRoles={["sales", "sales_lead"]}>
      <AllLeads />
    </ProtectedRoute>
  )
}

function AllLeads() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [focus, setFocus] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch("/api/crm/leads", { cache: "no-store" })
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function move(id: string, stage: string) {
    await fetch(`/api/crm/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) })
    await load()
  }

  if (loading) return <div style={{ padding: 40, color: INK2 }}>Loading your leads…</div>
  // Curated columns (same set as the drawer's Stage dropdown) — not the full pipeline.
  const stages: any[] = STAGE_OPTIONS
  const columns: Record<string, any[]> = data?.columns || {}
  const counts: Record<string, number> = data?.counts || {}
  const total = data?.total || 0

  const match = (l: any) => !q || [l.name, l.phone, l.destination, l.channel, l.country].join(" ").toLowerCase().includes(q.toLowerCase())
  const visibleStages = focus ? stages.filter((s) => s.id === focus) : stages

  return (
    <div style={{ padding: "8px 4px" }}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide" style={{ color: GREEN }}>SALES · PIPELINE</div>
          <h1 className="text-2xl font-bold" style={{ color: INK }}>All Leads</h1>
          <p className="text-sm" style={{ color: INK2 }}>{total} lead{total === 1 ? "" : "s"} in your pipeline — only yours.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
            <Search className="w-4 h-4" style={{ color: INK3 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className="text-sm outline-none bg-transparent" style={{ width: 160, color: INK }} />
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#0f7a4a,#06a15c)" }}>
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: "thin" }}>
        {stages.map((s) => {
          const active = focus === s.id
          return (
            <button key={s.id} onClick={() => setFocus(active ? null : s.id)}
              className="flex-shrink-0 rounded-xl px-3 py-2 text-left transition-all"
              style={{ background: active ? s.accent : "#fff", border: `1px solid ${active ? s.accent : LINE}`, minWidth: 92 }}>
              <div className="text-lg font-bold" style={{ color: active ? "#fff" : s.accent }}>{counts[s.id] ?? 0}</div>
              <div className="text-[11px] font-medium truncate" style={{ color: active ? "rgba(255,255,255,0.9)" : INK2 }}>{s.icon} {s.label}</div>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {visibleStages.map((s) => {
          const cards = (columns[s.id] || []).filter(match)
          return (
            <div key={s.id} className="flex-shrink-0 rounded-xl flex flex-col" style={{ width: 268, background: "rgba(15,31,23,0.025)", border: `1px solid ${LINE}` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId.current) { move(dragId.current, s.id); dragId.current = null } }}>
              <div className="flex items-center gap-2 px-3 py-2.5 sticky top-0 rounded-t-xl" style={{ background: "#fff", borderBottom: `2px solid ${s.accent}` }}>
                <span>{s.icon}</span>
                <span className="text-sm font-semibold" style={{ color: INK }}>{s.label}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${s.accent}1a`, color: s.accent }}>{cards.length}</span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {cards.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onDragStart={() => { dragId.current = l.id }} />
                ))}
                {cards.length === 0 && <div className="text-xs text-center py-6" style={{ color: INK3 }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && <AddLead onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function LeadCard({ lead, onOpen, onDragStart }: any) {
  const overdue = lead.followUpAt && new Date(lead.followUpAt).getTime() < Date.now()
  return (
    <div draggable onDragStart={onDragStart} onClick={onOpen}
      className="rounded-lg p-2.5 cursor-pointer transition-shadow hover:shadow-md" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TEMP[lead.temperature] || "#999" }} title={lead.temperature} />
        <span className="text-sm font-semibold truncate" style={{ color: INK }}>{lead.name || lead.phone || "New lead"}</span>
        <span className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(15,31,23,0.05)", color: INK3 }}>{lead.channel}</span>
      </div>
      <div className="text-[11px] mt-1.5 flex items-center gap-1.5 flex-wrap" style={{ color: INK2 }}>
        {lead.destination && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.destination}</span>}
        {lead.pax > 0 && <span className="flex items-center gap-0.5"><Users2 className="w-3 h-3" />{lead.pax}</span>}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] font-semibold" style={{ color: GREEN }}>{lead.budgetText || "—"}</span>
        {lead.followUpAt && (
          <span className="text-[10px] flex items-center gap-0.5" style={{ color: overdue ? "#ef4444" : INK3 }}>
            <Clock className="w-3 h-3" />{fmtShort(lead.followUpAt)}
          </span>
        )}
      </div>
    </div>
  )
}
