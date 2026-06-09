"use client"

// Call Dashboard — UI shell only (no D1, no table, no API, no dummy data).
// Mirrors the provided design: filters, KPI tiles, the three summary panels
// (Call By Status · Call summary by Lead Source · Call By Lead Stage), and the
// calls table. The call entries + workflow/logic are wired later.

import { ProtectedRoute } from "@/components/protected-route"
import { useState } from "react"
import {
  Phone, PhoneOutgoing, PhoneIncoming, Timer, Clock, Search, SlidersHorizontal,
  ChevronRight, ChevronLeft,
} from "lucide-react"

const INK = "#0f1f17", INK2 = "rgba(15,31,23,0.55)", INK3 = "rgba(15,31,23,0.4)", GREEN = "#06a15c", LINE = "rgba(15,31,23,0.08)"

const KPIS = [
  { key: "total", label: "Total Calls", icon: Phone, accent: GREEN, value: "0" },
  { key: "unique", label: "Unique Calls", icon: Phone, accent: GREEN, value: "0" },
  { key: "minutes", label: "Total Call Minutes", icon: Timer, accent: "#d4a017", value: "0", suffix: "min" },
  { key: "avg", label: "Average Call Time", icon: Clock, accent: "#d4a017", value: "0", suffix: "min" },
  { key: "out", label: "Outbound Calls", icon: PhoneOutgoing, accent: "#0e9488", value: "0" },
  { key: "in", label: "Inbound Calls", icon: PhoneIncoming, accent: "#3b82f6", value: "0" },
]

const CALL_STATUSES = ["ANSWERED", "BUSY", "NO ANSWER", "FAILED", "REJECTED", "MISSED"]
const LEAD_STAGES = [
  "New", "Call Back", "Not attended", "Not Interested", "Pending Quotes", "Quote Given",
  "In Discussion", "CTW", "CNW", "No Response", "Boomerang", "Won", "Lost",
]

export default function CallDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={["sales", "sales_lead", "admin", "owner"]}>
      <CallDashboard />
    </ProtectedRoute>
  )
}

function CallDashboard() {
  const [callType, setCallType] = useState("Total Calls")
  const [assignee, setAssignee] = useState("All Assignees")
  const [range, setRange] = useState("Today")

  const sel = "appearance-none text-sm rounded-lg border bg-white pl-3 pr-8 py-2 outline-none cursor-pointer"

  return (
    <div style={{ padding: "8px 4px" }}>
      {/* Header + filters */}
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="text-xs font-bold tracking-wide" style={{ color: GREEN }}>SALES · CALLS</div>
          <h1 className="text-2xl font-bold" style={{ color: INK }}>Call Dashboard</h1>
          <p className="text-sm" style={{ color: INK2 }}>Call activity, outcomes and follow-ups across your team.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dropdown value={callType} onChange={setCallType} options={["Total Calls", "Outbound", "Inbound"]} className={sel} />
          <Dropdown value={assignee} onChange={setAssignee} options={["All Assignees"]} className={sel} />
          <Dropdown value={range} onChange={setRange} options={["Today", "Yesterday", "This Week", "This Month", "Custom"]} className={sel} />
          <button className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "#fff", border: `1px solid ${LINE}`, color: INK2 }} title="More filters">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {KPIS.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.key} className="rounded-xl p-4" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
              <span className="w-9 h-9 rounded-lg grid place-items-center mb-2.5" style={{ background: `${k.accent}1a`, color: k.accent }}>
                <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </span>
              <div className="text-2xl font-bold" style={{ color: INK }}>
                {k.value}{k.suffix ? <span className="text-sm font-semibold ml-0.5" style={{ color: INK2 }}>{k.suffix}</span> : ""}
              </div>
              <div className="text-xs mt-0.5" style={{ color: INK2 }}>{k.label}</div>
            </div>
          )
        })}
      </div>

      {/* Three summary panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Call By Status */}
        <Panel>
          <PanelHead left="Call By Status" right="Count" />
          {CALL_STATUSES.map((s) => (
            <Row key={s} left={<span style={{ color: INK }}>{s}</span>} right="0" />
          ))}
        </Panel>

        {/* Call summary by Lead Source */}
        <Panel>
          <div className="px-1 pb-2 mb-1 text-sm font-semibold" style={{ color: INK, borderBottom: `1px solid ${LINE}` }}>Call summary by Lead Source</div>
          <div className="flex items-center justify-center" style={{ minHeight: 220 }}>
            <div className="text-center">
              <div className="w-32 h-32 rounded-full mx-auto mb-3" style={{ border: `14px solid rgba(15,31,23,0.06)` }} />
              <div className="text-sm" style={{ color: INK3 }}>No call data yet</div>
            </div>
          </div>
        </Panel>

        {/* Call By Lead Stage */}
        <Panel>
          <PanelHead left="Call By Lead Stage" right="Count" />
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {LEAD_STAGES.map((s) => (
              <Row key={s} left={<span style={{ color: INK }}>{s}</span>} right="0" />
            ))}
          </div>
        </Panel>
      </div>

      {/* Calls table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 880 }}>
            <thead>
              <tr style={{ background: "#f3f8f5" }}>
                {["Customer Name", "Customer No", "Called By", "Date & Time", "Status", "Lead Status", "Next Followup Date", "Audio Clip"].map((h) => (
                  <th key={h} className="text-left font-bold px-4 py-3 whitespace-nowrap" style={{ color: INK }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="text-center py-16" style={{ color: INK3 }}>
                  <Phone className="w-7 h-7 mx-auto mb-2 opacity-40" />
                  No call records yet — call logging will be wired up next.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* pager (visual) */}
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <button className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: "rgba(15,31,23,0.05)", color: INK3 }}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs" style={{ color: INK3 }}>0–0 of 0</span>
          <button className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: "rgba(15,31,23,0.05)", color: INK3 }}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}

function Dropdown({ value, onChange, options, className }: any) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className} style={{ borderColor: LINE, color: INK }}>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronRight className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" style={{ color: INK3 }} />
    </div>
  )
}

function Panel({ children }: any) {
  return <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${LINE}` }}>{children}</div>
}
function PanelHead({ left, right }: any) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 mb-1" style={{ borderBottom: `1px solid ${LINE}` }}>
      <span className="text-sm font-semibold" style={{ color: INK }}>{left}</span>
      <span className="text-xs font-semibold" style={{ color: INK2 }}>{right}</span>
    </div>
  )
}
function Row({ left, right }: any) {
  return (
    <div className="flex items-center justify-between px-1 py-2.5 text-sm" style={{ borderBottom: `1px solid ${LINE}` }}>
      <span>{left}</span>
      <span className="font-semibold" style={{ color: INK2 }}>{right}</span>
    </div>
  )
}
