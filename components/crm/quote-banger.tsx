"use client"

// Module N — the "banger": a persistent, audible + visual alert that fires when a
// pending quote breaches its SLA and keeps nagging (reminders) until the quote is
// actually sent. Acknowledging quiets the current popup but NOT the clock (AC-9).
// Mounted globally on the sales layout; polls the owner's quote alerts and advances
// the server timers via /api/engine/tick.

import { useEffect, useRef, useState, useCallback } from "react"
import { AlertTriangle, Send, BellOff, Clock } from "lucide-react"

const POLL_MS = 15_000

export function QuoteBanger() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [slaMin, setSlaMin] = useState(30)
  const lastReminderRef = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    // Read this owner's pending-quote status. The alerts endpoint advances the (cheap,
    // quote-only) timers itself — we must NOT call the full /api/engine/tick from the
    // browser: that runs every subsystem against remote D1 and can take minutes.
    const r = await fetch("/api/crm/quotes/alerts", { cache: "no-store" }).catch(() => null)
    if (!r || !r.ok) return
    const d = await r.json()
    setSlaMin(d.slaMin || 30)
    const list: any[] = d.quotes || []
    // Beep when a quote is newly breached or a new reminder has fired.
    for (const q of list) {
      if (q.breached && !q.acked) {
        const prev = lastReminderRef.current[q.id]
        if (prev !== q.lastReminderAt) { beep(); lastReminderRef.current[q.id] = q.lastReminderAt }
      }
    }
    setAlerts(list)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  async function send(id: string) {
    await fetch(`/api/crm/leads/${id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel: "whatsapp" }) })
    await load()
  }
  async function ack(id: string) {
    await fetch(`/api/crm/leads/${id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ack" }) })
    setAlerts((a) => a.map((q) => q.id === id ? { ...q, acked: true } : q))
  }
  async function extend(id: string, minutes: number) {
    await fetch(`/api/crm/leads/${id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extend", minutes }) })
    await load()
  }

  const breached = alerts.filter((q) => q.breached && !q.acked)
  const soon = alerts.filter((q) => !q.breached).sort((a, b) => a.remainingMin - b.remainingMin)

  if (!breached.length && !soon.length) return null

  return (
    // z-30 keeps the banger BELOW the lead drawer (overlay z-40 / aside z-50) so it never
    // covers the drawer's action buttons; the same SLA info is shown inside the open drawer.
    <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2" style={{ width: 340, maxWidth: "calc(100vw - 32px)" }}>
      {/* Breached — the banger */}
      {breached.map((q) => (
        <div key={q.id} className="rounded-xl p-3 text-white shadow-2xl animate-pulse" style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-bold text-sm">Quote overdue!</span>
            <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.2)" }}>{q.elapsedMin}m</span>
          </div>
          <div className="text-sm mt-1">
            <b>{q.name}</b>{q.destination ? ` · ${q.destination}` : ""} — quote unsent past {slaMin + (q.extraMin || 0)}m SLA{q.extraMin ? ` (incl. +${q.extraMin}m)` : ""}.
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => send(q.id)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#fff", color: "#b91c1c" }}>
              <Send className="w-3.5 h-3.5" /> Send Quote
            </button>
            <button onClick={() => ack(q.id)} className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(0,0,0,0.18)", color: "#fff" }}>
              <BellOff className="w-3.5 h-3.5" /> Quiet
            </button>
          </div>
          {/* Need more time? Extend the SLA. Miss it again → the team leader is alerted. */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] font-medium flex items-center gap-1 opacity-90"><Clock className="w-3.5 h-3.5" /> More time:</span>
            <button onClick={() => extend(q.id, 30)} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.45)" }}>+30 min</button>
            <button onClick={() => extend(q.id, 60)} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.45)" }}>+1 hr</button>
          </div>
          {q.extended && <div className="text-[10px] mt-1.5 opacity-90">⚠ Extension used — if this is missed again, your team leader is notified.</div>}
        </div>
      ))}
      {/* Approaching — subtle countdown */}
      {soon.slice(0, 2).map((q) => (
        <div key={q.id} className="rounded-xl p-2.5 shadow-lg" style={{ background: "#fff", border: "1px solid rgba(212,160,23,0.4)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "#9a7400" }}>
            <Clock className="w-3.5 h-3.5" />
            <span className="font-semibold" style={{ color: "#0f1f17" }}>{q.name}</span>
            <span className="ml-auto font-mono font-bold">{q.remainingMin}m left</span>
          </div>
          <button onClick={() => send(q.id)} className="w-full mt-1.5 py-1 rounded-md text-xs font-semibold" style={{ background: "rgba(6,161,92,0.1)", color: "#06a15c" }}>Send Quote now</button>
        </div>
      ))}
    </div>
  )
}

// Short attention beep via Web Audio (no asset needed).
function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = "square"; o.frequency.value = 880
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    o.start(); o.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch { /* autoplay may be blocked until user interacts — visual alert still shows */ }
}
