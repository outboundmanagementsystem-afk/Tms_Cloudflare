"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { getItinerariesByStatus } from "@/lib/firestore"
import { computeNpsMetrics, feedbackStatus, npsCategory, isFeedbackOverdue, isTripCompleted } from "@/lib/nps"
import Link from "next/link"
import { Star, TrendingUp, Users, CheckCircle, AlertTriangle, Smile, Meh, Frown } from "lucide-react"

export default function PostOpsFeedbackPage() {
    return (
        <ProtectedRoute allowedRoles={["post_ops", "post_ops_lead", "admin", "owner"]}>
            <FeedbackContent />
        </ProtectedRoute>
    )
}

function FeedbackContent() {
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => { load() }, [])
    const load = async () => {
        setLoading(true)
        try {
            const completed = await getItinerariesByStatus("completed")
            setItems((completed || []).filter(isTripCompleted))
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const m = computeNpsMetrics(items)
    // Newest completed first.
    const rows = [...items].sort((a, b) => (String(b.postOpsStatusUpdatedAt || b.endDate) > String(a.postOpsStatusUpdatedAt || a.endDate) ? 1 : -1))

    const statusTag = (it: any) => {
        const fs = feedbackStatus(it.feedback)
        if (fs === "completed") return { label: "Completed", bg: "rgba(6,161,92,0.12)", color: "#06a15c" }
        if (isFeedbackOverdue(it)) return { label: "Overdue", bg: "rgba(239,68,68,0.12)", color: "#dc2626" }
        return { label: fs === "partial" ? "Incomplete" : "Pending", bg: "rgba(245,158,11,0.14)", color: "#b45309" }
    }

    const npsColor = m.nps >= 50 ? "#06a15c" : m.nps >= 0 ? "#f59e0b" : "#ef4444"

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: "#052210" }}>Feedback &amp; NPS</h1>
                <p className="font-sans text-sm mt-1" style={{ color: "rgba(5,34,16,0.5)" }}>Post-trip feedback collection and Net Promoter Score</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#06a15c", borderTopColor: "transparent" }} /></div>
            ) : (
                <>
                    {/* Metric cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                            <div className="flex items-center justify-between">
                                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-black/40">NPS Score</p>
                                <TrendingUp className="w-4 h-4" style={{ color: npsColor }} />
                            </div>
                            <p className="font-serif text-3xl font-bold mt-1" style={{ color: npsColor }}>{m.nps}</p>
                            <p className="font-sans text-[10px] text-gray-400 mt-1">%Promoters − %Detractors</p>
                        </div>
                        <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                            <div className="flex items-center justify-between">
                                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-black/40">Feedbacks Collected</p>
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                            </div>
                            <p className="font-serif text-3xl font-bold mt-1 text-[#052210]">{m.collected}</p>
                            <p className="font-sans text-[10px] text-gray-400 mt-1">of {m.eligible} completed trips</p>
                        </div>
                        <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                            <div className="flex items-center justify-between">
                                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-black/40">Response Rate</p>
                                <Users className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="font-serif text-3xl font-bold mt-1 text-[#052210]">{m.responseRate}%</p>
                            <p className="font-sans text-[10px] text-gray-400 mt-1">collected ÷ eligible</p>
                        </div>
                        <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                            <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-black/40 mb-2">Breakdown</p>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-emerald-600"><Smile className="w-3.5 h-3.5" /> Promoters</span><span className="font-bold">{m.promoters}</span></div>
                                <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-amber-600"><Meh className="w-3.5 h-3.5" /> Passives</span><span className="font-bold">{m.passives}</span></div>
                                <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-red-500"><Frown className="w-3.5 h-3.5" /> Detractors</span><span className="font-bold">{m.detractors}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Average ratings */}
                    <div className="rounded-2xl bg-white p-5" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                        <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-black/40 mb-3">Average Ratings (out of 5)</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[["Accommodation", m.avg.accommodation], ["Transport", m.avg.transport], ["Sightseeing", m.avg.sightseeing], ["On-Trip Support", m.avg.support]].map(([label, val]) => (
                                <div key={label as string}>
                                    <p className="font-sans text-[11px] text-gray-500">{label}</p>
                                    <p className="font-serif text-xl font-bold flex items-center gap-1" style={{ color: "#052210" }}><Star className="w-4 h-4" style={{ color: "#f59e0b", fill: "#f59e0b" }} /> {val || "—"}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* List */}
                    <div className="rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                        <div className="px-5 py-3" style={{ background: "#f8faf9", borderBottom: "1px solid rgba(5,34,16,0.05)" }}>
                            <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-emerald-700">Completed Trips ({rows.length})</p>
                        </div>
                        <div className="divide-y" style={{ borderColor: "rgba(5,34,16,0.05)" }}>
                            {rows.length === 0 ? (
                                <p className="px-5 py-8 text-center font-sans text-sm text-gray-400">No completed trips yet.</p>
                            ) : rows.map((it: any) => {
                                const tag = statusTag(it)
                                const cat = npsCategory(it.feedback?.npsScore)
                                return (
                                    <Link key={it.id} href={`/post-ops/booking/${it.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                                        <div className="min-w-0">
                                            <p className="font-sans text-sm font-bold truncate" style={{ color: "#052210" }}>{it.customerName || "Guest"}</p>
                                            <p className="font-sans text-[11px] text-gray-500">{it.destination || "—"}</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            {it.feedback?.npsScore != null && (
                                                <span className="font-sans text-xs font-bold" style={{ color: cat === "promoter" ? "#06a15c" : cat === "passive" ? "#b45309" : "#dc2626" }}>{it.feedback.npsScore}/10</span>
                                            )}
                                            <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
