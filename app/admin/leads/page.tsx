"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useCallback } from "react"
import { AlertTriangle, Inbox, Users, Clock, ArrowRight } from "lucide-react"

const TEMP: Record<string, string> = { hot: "#ef4444", warm: "#f59e0b", cold: "#3b82f6" }
const REASON: Record<string, string> = { bounce_cap: "SLA bounce cap", morning_deadline: "Missed 11:00 deadline", hot_timeout: "Hot lead untouched", quote_transfer_cap: "Quote transfer cap — hand-assign", quote_missed_after_extension: "Quote unsent after extension" }

function ageMins(iso?: string | null) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

export default function ManagerLeadsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "owner", "sales_lead"]}>
      <Manager />
    </ProtectedRoute>
  )
}

function Manager() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch("/api/manager/overview", { cache: "no-store" })
    if (r.ok) setD(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(async () => {
      await fetch("/api/engine/tick", { method: "POST" }).catch(() => {})
      await load()
    }, 15_000)
    return () => clearInterval(t)
  }, [load])

  async function reassign(leadId: string, agentId: string) {
    if (!agentId) return
    await fetch("/api/manager/reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, agentId }) })
    await load()
  }
  async function resolve(id: string) {
    await fetch(`/api/manager/escalation/${id}/resolve`, { method: "POST" })
    await load()
  }
  async function setTargetFor(agentId: string, name: string, current?: number) {
    const v = prompt(`Set ${name}'s monthly target (₹):`, String(current || 500000))
    if (v == null) return
    const n = Number(v.replace(/[^\d]/g, ""))
    if (!n) return
    await fetch("/api/sales/target", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, target: n }) })
    await load()
  }

  if (loading) return <div style={{ padding: 40, color: "rgba(15,31,23,0.5)" }}>Loading…</div>
  const data = d || {}
  const agents: any[] = data.agents || []

  return (
    <div style={{ padding: "8px 4px" }}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: "#0f1f17" }}>Lead Engine · Manager</h1>
      <p className="text-sm mb-6" style={{ color: "rgba(15,31,23,0.55)" }}>Escalations, live pool, SLA breaches and agent capacity. Auto-refreshes.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Open escalations" value={(data.escalations || []).length} accent="#ef4444" />
        <Stat icon={<Inbox className="w-4 h-4" />} label="Pool waiting" value={data.pool?.count ?? 0} accent="#06a15c" />
        <Stat icon={<Clock className="w-4 h-4" />} label="SLA breaches today" value={data.slaBreachesToday ?? 0} accent="#f59e0b" />
        <Stat icon={<Users className="w-4 h-4" />} label="Agents online" value={`${data.online ?? 0}/${agents.length}`} accent="#06a15c" />
      </div>

      {/* Escalation queue */}
      <Card title="Escalation queue">
        {(data.escalations || []).length === 0 && <Empty text="No open escalations 🎉" />}
        {(data.escalations || []).map((e: any) => (
          <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg flex-wrap mb-2" style={{ background: "rgba(239,68,68,0.05)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: TEMP[e.temperature] || "#999" }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: "#0f1f17" }}>
                {e.contactName || e.source} <span className="text-xs ml-1" style={{ color: "rgba(15,31,23,0.45)" }}>{e.destination}</span>
              </div>
              <div className="text-[11px]" style={{ color: "#b91c1c" }}>{REASON[e.reason] || e.reason}{e.fromAgent ? ` · was ${e.fromAgent}` : ""} · {ageMins(e.createdAt)}m ago</div>
            </div>
            <select defaultValue="" onChange={(ev) => reassign(e.leadId, ev.target.value)} className="text-xs px-2 py-1.5 rounded-md border" style={{ minWidth: 150 }}>
              <option value="">Reassign to…</option>
              {agents.filter((a) => a.availability === "online").map((a) => <option key={a.uid} value={a.uid}>{a.name} ({a.wip}/{2})</option>)}
            </select>
            <button onClick={() => resolve(e.id)} className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "rgba(15,31,23,0.06)", color: "rgba(15,31,23,0.6)" }}>Resolve</button>
          </div>
        ))}
      </Card>

      {/* Pending quotes past the manager pre-alert (Module N) */}
      {(data.quoteWatch || []).length > 0 && (
        <Card title={`Quotes overdue · ${(data.quoteWatch || []).length}`}>
          {(data.quoteWatch || []).map((q: any) => (
            <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg flex-wrap mb-2" style={{ background: "rgba(245,158,11,0.06)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: TEMP[q.temperature] || "#999" }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium" style={{ color: "#0f1f17" }}>{q.name} <span className="text-xs ml-1" style={{ color: "rgba(15,31,23,0.45)" }}>{q.destination}</span></div>
                <div className="text-[11px]" style={{ color: "#b45309" }}>owner {q.owner} · unsent {q.elapsedMin}m{q.transfers ? ` · transferred ×${q.transfers}` : ""}{q.breached ? " · breached" : ""}</div>
              </div>
              <select defaultValue="" onChange={(ev) => reassign(q.id, ev.target.value)} className="text-xs px-2 py-1.5 rounded-md border" style={{ minWidth: 150 }}>
                <option value="">Hand-assign to…</option>
                {agents.filter((a) => a.availability === "online").map((a) => <option key={a.uid} value={a.uid}>{a.name} ({a.wip}/{2})</option>)}
              </select>
            </div>
          ))}
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Pool */}
        <Card title={`Live pool · ${data.pool?.count ?? 0}`}>
          <div className="text-xs mb-3" style={{ color: "rgba(15,31,23,0.5)" }}>
            Oldest waiting: {data.pool?.oldest ? `${ageMins(data.pool.oldest)}m` : "—"}
          </div>
          <div className="flex flex-wrap gap-2">
            {(data.pool?.bySource || []).map((s: any) => (
              <span key={s.source} className="px-3 py-1.5 rounded-full text-xs" style={{ background: "rgba(15,31,23,0.05)", color: "rgba(15,31,23,0.7)" }}>{s.source} · {s.n}</span>
            ))}
            {(!data.pool?.bySource || data.pool.bySource.length === 0) && <Empty text="Pool empty." />}
          </div>
        </Card>

        {/* Agents */}
        <Card title="Agents">
          {agents.map((a) => (
            <div key={a.uid} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: "rgba(15,31,23,0.06)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: a.availability === "online" ? "#06a15c" : "rgba(15,31,23,0.2)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: "#0f1f17" }}>{a.name} <span className="text-[10px] uppercase ml-1" style={{ color: "rgba(15,31,23,0.4)" }}>{a.role}</span></div>
                <div className="text-[11px]" style={{ color: "rgba(15,31,23,0.45)" }}>WIP {a.wip} · active {a.active} · target {a.target ? "₹" + Number(a.target).toLocaleString("en-IN") : "—"}</div>
              </div>
              <button onClick={() => setTargetFor(a.uid, a.name, a.target)} className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: "rgba(20,119,75,0.1)", color: "#14774b" }}>Set target</button>
            </div>
          ))}
          {agents.length === 0 && <Empty text="No sales agents." />}
        </Card>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, accent }: any) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid rgba(15,31,23,0.08)" }}>
      <div className="flex items-center gap-2 text-2xl font-bold" style={{ color: accent || "#0f1f17" }}>{icon}{value}</div>
      <div className="text-xs mt-1" style={{ color: "rgba(15,31,23,0.5)" }}>{label}</div>
    </div>
  )
}
function Card({ title, children }: any) {
  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: "#fff", border: "1px solid rgba(15,31,23,0.08)" }}>
      <h2 className="font-semibold text-sm mb-3" style={{ color: "#0f1f17" }}>{title}</h2>
      {children}
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <div className="text-xs py-2" style={{ color: "rgba(15,31,23,0.4)" }}>{text}</div>
}
