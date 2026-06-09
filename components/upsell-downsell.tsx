"use client"

import { useMemo, useState } from "react"
import { TrendingUp, TrendingDown, X, ArrowUpDown, CheckCircle } from "lucide-react"
import { useDialog } from "@/components/dialog-provider"
import { updateItinerary } from "@/lib/firestore"

const ROLES_ALLOWED = ["pre_ops", "pre_ops_lead", "post_ops", "post_ops_lead", "sales", "sales_lead", "admin", "owner", "ops", "ops_lead"]

const planTotal = (p: any) => Number(p?.overrideTotal || p?.totalPrice || p?.total || 0)
const planId = (p: any, i: number) => p?.planId || p?.id || String(i)
const planLabel = (p: any, i: number) => p?.planName || p?.category || `Plan ${i + 1}`

/** Small coloured pill shown wherever an itinerary already has an upsell/downsell. */
export function UpsellBadge({ itinerary, className = "" }: { itinerary: any; className?: string }) {
    const type = itinerary?.upsell?.type
    if (type !== "upsell" && type !== "downsell") return null
    const isUp = type === "upsell"
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider ${className}`}
            style={{
                background: isUp ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.14)",
                color: isUp ? "#059669" : "#b45309",
                border: `1px solid ${isUp ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.35)"}`,
            }}
            title={`${isUp ? "Upsell" : "Downsell"}${itinerary.upsell?.amount ? ` · ${isUp ? "+" : "−"}₹${Number(itinerary.upsell.amount).toLocaleString()}` : ""}${itinerary.upsell?.totalAmount != null ? ` · total ₹${Number(itinerary.upsell.totalAmount).toLocaleString()}` : ""}${itinerary.upsell?.note ? ` — ${itinerary.upsell.note}` : ""}`}
        >
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? "Upsell" : "Downsell"}
        </span>
    )
}

/** Read-only history of every upsell/downsell on a booking — visible to ALL roles
 *  (sales, pre-ops, post-ops, admin) so anyone can see who changed the price, by how
 *  much, the new total, and the note. Renders nothing if there's no history. */
export function UpsellHistory({ booking }: { booking: any }) {
    const log: any[] = Array.isArray(booking?.upsellLog)
        ? booking.upsellLog
        : (booking?.upsell ? [booking.upsell] : [])
    if (!log.length) return null
    const fmtWhen = (at: any) => {
        if (!at) return ""
        try { const d = new Date(at); return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) } catch { return String(at) }
    }
    // Newest first.
    const rows = [...log].reverse()
    return (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid rgba(5,34,16,0.08)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(5,34,16,0.06)" }}>
                <ArrowUpDown className="w-4 h-4" style={{ color: "#b45309" }} />
                <span className="font-sans text-[11px] font-bold uppercase tracking-wider" style={{ color: "#052210" }}>Upsell / Downsell History ({rows.length})</span>
            </div>
            <div className="divide-y divide-gray-50">
                {rows.map((r: any, i: number) => {
                    const isUp = r.type === "upsell"
                    return (
                        <div key={i} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider"
                                    style={{ background: isUp ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.14)", color: isUp ? "#059669" : "#b45309", border: `1px solid ${isUp ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.35)"}` }}>
                                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{r.type}
                                </span>
                                <span className="font-serif text-base font-bold" style={{ color: "#052210" }}>₹{Number(r.totalAmount ?? 0).toLocaleString()}</span>
                            </div>
                            <p className="font-sans text-[12px] mt-1.5" style={{ color: "rgba(5,34,16,0.7)" }}>
                                {r.planLabel ? <span className="font-semibold">{r.planLabel}: </span> : null}
                                ₹{Number(r.previousPrice ?? 0).toLocaleString()} {isUp ? "+" : "−"} ₹{Number(r.amount ?? 0).toLocaleString()} = ₹{Number(r.totalAmount ?? 0).toLocaleString()}
                            </p>
                            {r.note ? <p className="font-sans text-[12px] mt-1 italic" style={{ color: "rgba(5,34,16,0.55)" }}>“{r.note}”</p> : null}
                            <p className="font-sans text-[10px] mt-1.5" style={{ color: "rgba(5,34,16,0.4)" }}>
                                by <span className="font-semibold">{r.by || "—"}</span>{r.byRole ? ` (${String(r.byRole).replace(/_/g, " ")})` : ""}{r.at ? ` · ${fmtWhen(r.at)}` : ""}
                            </p>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/** Button + modal that records an upsell/downsell (type, amount, note, revised plan) on the booking. */
export function UpsellDownsellControl({
    booking,
    userProfile,
    onSaved,
}: {
    booking: any
    userProfile: any
    onSaved?: () => void
}) {
    const { showDialog } = useDialog()
    const [open, setOpen] = useState(false)
    const plans: any[] = Array.isArray(booking?.plans) ? booking.plans : []

    const allowed = userProfile && ROLES_ALLOWED.includes(userProfile.role)
    if (!allowed) return <UpsellBadge itinerary={booking} />

    return (
        <>
            <UpsellBadge itinerary={booking} />
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                style={{ background: "rgba(245,158,11,0.1)", color: "#b45309", border: "1px solid rgba(245,158,11,0.25)" }}
            >
                <ArrowUpDown className="w-3 h-3" /> Upsell / Downsell
            </button>
            {open && (
                <UpsellDownsellModal
                    booking={booking}
                    plans={plans}
                    userProfile={userProfile}
                    onClose={() => setOpen(false)}
                    onSaved={() => { setOpen(false); onSaved?.() }}
                    showDialog={showDialog}
                />
            )}
        </>
    )
}

function UpsellDownsellModal({ booking, plans, userProfile, onClose, onSaved, showDialog }: any) {
    const [type, setType] = useState<"upsell" | "downsell">("upsell")
    const initialPlanIdx = useMemo(() => {
        const idx = plans.findIndex((p: any, i: number) => planId(p, i) === booking?.selectedPlanId)
        return idx >= 0 ? idx : 0
    }, [plans, booking?.selectedPlanId])
    const [planIdx, setPlanIdx] = useState<number>(initialPlanIdx)
    const [price, setPrice] = useState<string>(plans.length ? String(planTotal(plans[initialPlanIdx])) : "")
    const [amount, setAmount] = useState<string>("")
    const [note, setNote] = useState<string>("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const onPickPlan = (i: number) => { setPlanIdx(i); setPrice(String(planTotal(plans[i]))) }

    // Total = previous plan price (+) upsell  /  (−) downsell amount.
    const prevPrice = Number(price) || 0
    const amt = Number(amount) || 0
    const totalAmount = type === "upsell" ? prevPrice + amt : prevPrice - amt

    const handleSave = async () => {
        setError("")
        const amt = Number(amount)
        if (!amt || amt <= 0) { setError("Enter the upsell/downsell amount (₹).") ; return }
        if (plans.length && (planIdx < 0 || planIdx >= plans.length)) { setError("Select the revised plan."); return }
        if (type === "downsell" && totalAmount < 0) { setError("Downsell amount is larger than the plan price."); return }
        setSaving(true)
        try {
            const now = new Date().toISOString()
            // The selected plan's price becomes the computed total (previous ± amount).
            let updatedPlans = plans
            if (plans.length) {
                updatedPlans = plans.map((p: any, i: number) => i === planIdx ? { ...p, totalPrice: totalAmount, overrideTotal: totalAmount } : p)
            }
            const thePlanId = plans.length ? planId(plans[planIdx], planIdx) : (booking?.selectedPlanId || "")
            const record = {
                type, amount: amt, note: note.trim(),
                planId: thePlanId,
                planLabel: plans.length ? planLabel(plans[planIdx], planIdx) : "",
                previousPrice: prevPrice,
                totalAmount,
                by: userProfile?.name || userProfile?.email || "",
                byRole: userProfile?.role || "",
                at: now,
            }
            const log = Array.isArray(booking?.upsellLog) ? booking.upsellLog : []
            await updateItinerary(booking.id, {
                selectedPlanId: thePlanId,
                plans: updatedPlans,
                upsell: record,
                upsellLog: [...log, record],
            })
            showDialog({
                title: type === "upsell" ? "Upsell Recorded" : "Downsell Recorded",
                message: `${type === "upsell" ? "Added" : "Subtracted"} ₹${amt.toLocaleString()} → new total ₹${totalAmount.toLocaleString()}. This is now visible on the booking and itinerary for everyone.`,
                type: "success",
            })
            onSaved?.()
        } catch (e: any) {
            setError(e?.message || "Failed to save. Please try again.")
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col" style={{ background: "#fff", boxShadow: "0 32px 96px rgba(0,0,0,0.25)", maxHeight: "calc(100vh - 40px)" }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #7c4a03 0%, #92400e 100%)" }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                            <ArrowUpDown className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="font-serif text-lg tracking-wide text-white leading-tight">Upsell / Downsell</h2>
                            <p className="font-sans text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>{booking?.customerName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"><X className="w-4 h-4 text-white/70" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: "none" }}>
                    {/* Type */}
                    <div>
                        <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>Type <span className="text-red-500">*</span></label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["upsell", "downsell"] as const).map(t => {
                                const active = type === t
                                const up = t === "upsell"
                                return (
                                    <button key={t} onClick={() => setType(t)} className="flex items-center justify-center gap-2 py-3 rounded-xl font-sans text-sm font-bold capitalize transition-all"
                                        style={{ background: active ? (up ? "#059669" : "#b45309") : "#f9fafb", color: active ? "#fff" : "rgba(5,34,16,0.5)", border: active ? "1.5px solid transparent" : "1.5px solid #e5e7eb" }}>
                                        {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} {t}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Previous plan */}
                    {plans.length > 0 && (
                        <div>
                            <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>Previous Plan <span className="text-red-500">*</span></label>
                            <div className="flex flex-col gap-2">
                                {plans.map((p: any, i: number) => {
                                    const active = planIdx === i
                                    return (
                                        <button key={i} onClick={() => onPickPlan(i)} className="flex items-center justify-between px-4 py-2.5 rounded-xl font-sans text-sm font-semibold transition-all text-left"
                                            style={{ background: active ? "#052210" : "#fff", color: active ? "#4ade80" : "rgba(5,34,16,0.6)", border: active ? "1.5px solid rgba(6,161,92,0.4)" : "1.5px solid #e5e7eb" }}>
                                            <span>{planLabel(p, i)}{planId(p, i) === booking?.selectedPlanId ? " (current)" : ""}</span>
                                            <span className="font-serif text-base font-bold" style={{ color: active ? "#4ade80" : "#06a15c" }}>₹{planTotal(p).toLocaleString()}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Previous plan price (base) */}
                    {plans.length > 0 && (
                        <div>
                            <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>Previous Plan Price ₹</label>
                            <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Current package price"
                                className="w-full px-4 py-3 rounded-xl font-sans text-sm font-bold" style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", color: "#052210", outline: "none" }} />
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>{type === "upsell" ? "Upsell" : "Downsell"} Amount ₹ <span className="text-red-500">*</span></label>
                        <input type="number" min="1" value={amount} onChange={e => { setAmount(e.target.value); setError("") }} placeholder="e.g. 5000" autoFocus
                            className="w-full px-4 py-3 rounded-xl font-sans text-sm font-bold" style={{ background: "#f9fafb", border: error ? "1.5px solid #ef4444" : "1.5px solid #e5e7eb", color: "#052210", outline: "none" }} />
                    </div>

                    {/* Computed total (read-only): previous price + upsell / − downsell */}
                    <div>
                        <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>Total Amount ₹</label>
                        <div className="w-full px-4 py-3 rounded-xl font-serif text-lg font-bold flex items-center justify-between"
                            style={{ background: type === "upsell" ? "#ecfdf5" : "#fffbeb", border: `1.5px solid ${type === "upsell" ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.4)"}`, color: type === "upsell" ? "#059669" : "#b45309" }}>
                            <span>₹{totalAmount.toLocaleString()}</span>
                            <span className="font-sans text-[11px] font-semibold opacity-70">
                                ₹{prevPrice.toLocaleString()} {type === "upsell" ? "+" : "−"} ₹{amt.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="font-sans text-[10px] font-bold tracking-wider uppercase mb-2 block" style={{ color: "rgba(5,34,16,0.5)" }}>Note <span className="font-normal normal-case" style={{ color: "rgba(5,34,16,0.3)" }}>(optional)</span></label>
                        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason / what changed…"
                            className="w-full px-4 py-3 rounded-xl font-sans text-sm resize-none" style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", color: "#052210", outline: "none" }} />
                    </div>

                    {error && <p className="font-sans text-xs text-red-500">{error}</p>}
                </div>

                <div className="flex-shrink-0 px-6 py-4 flex gap-3" style={{ borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-3.5 rounded-xl font-sans text-xs tracking-wider uppercase font-bold flex items-center justify-center gap-2"
                        style={{ background: saving ? "#e5e7eb" : "#052210", color: saving ? "#9ca3af" : "#4ade80", cursor: saving ? "not-allowed" : "pointer" }}>
                        {saving ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4ade80", borderTopColor: "transparent" }} /> : <CheckCircle className="w-4 h-4" />}
                        {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={onClose} disabled={saving} className="px-5 py-3.5 rounded-xl font-sans text-xs tracking-wider uppercase font-semibold" style={{ border: "1.5px solid #e5e7eb", color: "rgba(5,34,16,0.45)", background: "#fff" }}>Cancel</button>
                </div>
            </div>
        </div>
    )
}
