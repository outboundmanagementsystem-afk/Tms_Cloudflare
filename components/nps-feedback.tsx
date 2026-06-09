"use client"

import { useState } from "react"
import { updateItinerary } from "@/lib/firestore"
import { useDialog } from "@/components/dialog-provider"
import { feedbackStatus, npsCategory, type Feedback } from "@/lib/nps"
import { Star, CheckCircle, Send, AlertTriangle } from "lucide-react"

const RATING_FIELDS: { key: keyof NonNullable<Feedback["ratings"]>; label: string; hint: string }[] = [
  { key: "accommodation", label: "Accommodation & Hospitality", hint: "Room quality, location, cleanliness, staff" },
  { key: "transport", label: "Transport & Drivers", hint: "Vehicle condition, punctuality, safety, driver" },
  { key: "sightseeing", label: "Sightseeing & Local Guides", hint: "Tour quality, guide knowledge, pacing" },
  { key: "support", label: "On-Trip Operations & Support", hint: "Responsiveness of the Post-Ops team on tour" },
]

/** Post-Trip NPS / feedback capture form. The Post-Ops team records the client's response. */
export function NpsFeedback({ booking, userProfile, onSaved }: { booking: any; userProfile: any; onSaved?: () => void }) {
  const { showDialog } = useDialog()
  const existing: Feedback = booking?.feedback || {}
  const [nps, setNps] = useState<number | null>(existing.npsScore ?? null)
  const [ratings, setRatings] = useState<Record<string, number>>({
    accommodation: existing.ratings?.accommodation || 0,
    transport: existing.ratings?.transport || 0,
    sightseeing: existing.ratings?.sightseeing || 0,
    support: existing.ratings?.support || 0,
  })
  const [value, setValue] = useState<string>(existing.valueForMoney || "")
  const [highlight, setHighlight] = useState(existing.highlight || "")
  const [improvement, setImprovement] = useState(existing.improvement || "")
  const [saving, setSaving] = useState(false)

  const cat = npsCategory(nps)
  const draft: Feedback = { npsScore: nps, ratings: ratings as any, valueForMoney: value as any, highlight, improvement }
  const status = feedbackStatus(draft)

  const save = async () => {
    setSaving(true)
    try {
      const computed = feedbackStatus(draft)
      const fb: Feedback = {
        ...draft,
        status: computed,
        completedAt: computed === "completed" ? new Date().toISOString() : (existing.completedAt || ""),
        by: userProfile?.name || userProfile?.email || existing.by || "",
      }
      await updateItinerary(booking.id, { feedback: fb, extra: { feedback: fb } })
      showDialog({ title: "Feedback Saved", message: computed === "completed" ? "Feedback recorded and marked complete." : "Feedback saved as draft (some fields still pending).", type: "success" })
      onSaved?.()
    } catch (e: any) {
      showDialog({ title: "Error", message: e?.message || "Could not save feedback.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const npsColor = (n: number) => n <= 6 ? "#ef4444" : n <= 8 ? "#f59e0b" : "#06a15c"

  return (
    <div className="max-w-2xl mx-auto rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#062814,#052210)" }}>
        <div>
          <h3 className="font-serif text-lg text-white tracking-wide">Post-Trip Feedback (NPS)</h3>
          <p className="font-sans text-[11px] text-white/60">{booking?.customerName || "Guest"} · record the client's response</p>
        </div>
        {status === "completed" ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300"><CheckCircle className="w-3 h-3" /> Completed</span>
        ) : status === "partial" ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-200">Not Fully Completed</span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/60">Pending</span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Core NPS */}
        <div>
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">1. How likely to recommend us? (0–10)</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }).map((_, n) => (
              <button key={n} type="button" onClick={() => setNps(n)}
                className="w-9 h-9 rounded-lg font-sans text-sm font-bold transition-all"
                style={nps === n
                  ? { background: npsColor(n), color: "#fff", border: `1px solid ${npsColor(n)}` }
                  : { background: "#f9fafb", color: "#374151", border: "1px solid #e5e7eb" }}>
                {n}
              </button>
            ))}
          </div>
          {cat && (
            <p className="font-sans text-[11px] mt-2 font-bold" style={{ color: npsColor(nps || 0) }}>
              {cat === "promoter" ? "Promoter (9–10)" : cat === "passive" ? "Passive (7–8)" : "Detractor (0–6)"}
              {cat === "detractor" && <span className="inline-flex items-center gap-1 ml-2 font-normal"><AlertTriangle className="w-3 h-3" /> needs service recovery — your lead is alerted</span>}
            </p>
          )}
        </div>

        {/* Ratings */}
        <div className="space-y-3">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500">2. Rate each aspect (1–5)</p>
          {RATING_FIELDS.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-sans text-sm font-semibold text-[#052210]">{f.label}</p>
                <p className="font-sans text-[10px] text-gray-400">{f.hint}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRatings(prev => ({ ...prev, [f.key]: n === prev[f.key] ? 0 : n }))}>
                    <Star className="w-5 h-5" style={{ color: n <= (ratings[f.key] || 0) ? "#f59e0b" : "#d1d5db", fill: n <= (ratings[f.key] || 0) ? "#f59e0b" : "none" }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Value */}
        <div>
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">3. Value for money</p>
          <div className="grid grid-cols-3 gap-2">
            {([["excellent", "Excellent value"], ["fair", "Fair / average"], ["poor", "Expected more"]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setValue(v === value ? "" : v)}
                className="py-2.5 rounded-xl font-sans text-xs font-bold transition-all"
                style={value === v ? { background: "#052210", color: "#4ade80", border: "1px solid #052210" } : { background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Open text */}
        <div className="space-y-3">
          <div>
            <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">4. Highlight of the trip</p>
            <textarea rows={2} value={highlight} onChange={e => setHighlight(e.target.value)} placeholder="Specific experience, destination or team member that stood out…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-sm outline-none focus:border-emerald-500 resize-none" />
          </div>
          <div>
            <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">5. What could be better?</p>
            <textarea rows={2} value={improvement} onChange={e => setImprovement(e.target.value)} placeholder="Any hiccups, inconveniences or areas to improve…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-sm outline-none focus:border-emerald-500 resize-none" />
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-3.5 rounded-xl font-sans text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all"
          style={{ background: saving ? "#e5e7eb" : "#06a15c", color: saving ? "#9ca3af" : "#fff" }}>
          {saving ? "Saving…" : <><Send className="w-4 h-4" /> Save Feedback</>}
        </button>
      </div>
    </div>
  )
}
