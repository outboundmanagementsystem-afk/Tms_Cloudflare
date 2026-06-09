"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getItineraries } from "@/lib/firestore"
import { useAuth } from "@/lib/auth-context"
import { deriveBooking, totals, fmtINR, type DerivedBooking } from "@/lib/finance/derive"
import { MetricCard, Progress, StageBadge, SLABadge, SearchBox, EmptyState } from "@/components/finance/ui"
import {
    Layers, TrendingUp, Hourglass, CircleCheckBig, CircleDashed, CircleX,
    Briefcase, AlarmClock, HandCoins, ArrowRight, ChevronRight, PartyPopper,
} from "lucide-react"

export default function FinanceDashboard() {
    return (
        <ProtectedRoute allowedRoles={["finance", "finance_lead", "admin", "owner"]}>
            <FinanceContent />
        </ProtectedRoute>
    )
}

function FinanceContent() {
    const { userProfile } = useAuth()
    const router = useRouter()
    const [bookings, setBookings] = useState<DerivedBooking[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")

    useEffect(() => {
        ;(async () => {
            try {
                const all = await getItineraries()
                const active = all.filter((i: any) => i.status && i.status !== "draft")
                setBookings(active.map((i: any) => deriveBooking(i)))
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    const t = totals(bookings)
    const collectedPct = t.value > 0 ? Math.round((t.collected / t.value) * 100) : 0

    let needs = bookings.filter((b) => b.balance > 0)
    if (search) {
        const q = search.toLowerCase()
        needs = needs.filter((b) => `${b.client.name} ${b.destination} ${b.code}`.toLowerCase().includes(q))
    }
    needs.sort((a, b) => {
        const ao = a.sla?.overdue ? 1 : 0, bo = b.sla?.overdue ? 1 : 0
        if (ao !== bo) return bo - ao
        return b.balance - a.balance
    })
    const shown = needs.slice(0, 6)
    const firstName = (userProfile?.name || "").split(" ")[0] || "there"

    return (
        <div className="fin-scope">
            <div className="page">
                <div className="page-head">
                    <div className="grow">
                        <h1 className="page-title">Finance Dashboard</h1>
                        <p className="page-sub">Welcome, {firstName}</p>
                    </div>
                    <div className="page-head-actions">
                        <button className="btn btn-primary" onClick={() => router.push("/finance/payments")}>
                            <HandCoins size={17} strokeWidth={2} />
                            Manage Payments
                        </button>
                    </div>
                </div>

                <div style={{ maxWidth: 420, marginBottom: 26 }}>
                    <SearchBox value={search} onChange={setSearch} placeholder="Search clients, destinations, booking codes…" />
                </div>

                {/* Money metrics */}
                <div className="metric-grid">
                    <MetricCard accent="primary" icon={Layers} label="Total Package Value" value={fmtINR(t.value)}
                        foot={<><Briefcase size={13} strokeWidth={2} />{bookings.length} active bookings</>} />
                    <MetricCard accent="green" icon={TrendingUp} label="Total Collected" value={fmtINR(t.collected)}
                        foot={<><CircleCheckBig size={13} strokeWidth={2} />{collectedPct}% of package value</>} />
                    <MetricCard accent="red" icon={Hourglass} label="Pending Balance" value={fmtINR(t.balance)}
                        foot={<><AlarmClock size={13} strokeWidth={2} />{needs.length} bookings awaiting collection</>} />
                </div>

                {/* Count metrics */}
                <div className="metric-grid">
                    <MetricCard accent="green" icon={CircleCheckBig} label="Fully Paid" value={String(t.paid)} count foot="Balance cleared in full" />
                    <MetricCard accent="amber" icon={CircleDashed} label="Partial Payment" value={String(t.partial)} count foot="Advance received, balance due" />
                    <MetricCard accent="red" icon={CircleX} label="No Payment Yet" value={String(t.unpaid)} count foot="Awaiting first collection" />
                </div>

                {/* Requires payment collection */}
                <div className="section-head">
                    <div className="section-title">Requires Payment Collection</div>
                    <div className="grow" />
                    <button className="link-btn" onClick={() => router.push("/finance/payments")}>
                        View all<ArrowRight size={15} strokeWidth={2.2} />
                    </button>
                </div>
                <div className="card" style={{ overflow: "hidden" }}>
                    {loading ? (
                        <div style={{ padding: "52px 24px", textAlign: "center" }}>
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#0f8a5f", borderTopColor: "transparent" }} />
                        </div>
                    ) : shown.length === 0 ? (
                        <EmptyState icon={PartyPopper} title="All caught up" sub="No outstanding balances match your search." padding="52px 24px" />
                    ) : (
                        shown.map((b) => (
                            <div className="coll-row" key={b.id} onClick={() => router.push(`/finance/itinerary/${b.id}`)}>
                                <div className="coll-avatar">{b.client.name.charAt(0)}</div>
                                <div className="coll-id">
                                    <div className="coll-name">
                                        {b.client.title} {b.client.name}
                                        <StageBadge stage={b.latestStage} />
                                    </div>
                                    <div className="coll-meta">{b.destination} · {b.code} · {b.duration}</div>
                                </div>
                                <div className="coll-prog">
                                    <div className="coll-prog-top">
                                        <span className="pct tnum">{b.percent}% collected</span>
                                        <span className="amt tnum">{fmtINR(b.collected)} / {fmtINR(b.total)}</span>
                                    </div>
                                    <Progress pct={b.percent} tone={b.percent === 0 ? "red" : "amber"} />
                                </div>
                                <div className="coll-balance">
                                    <div className="lbl">Balance due</div>
                                    <div className="val tnum">{fmtINR(b.balance)}</div>
                                    <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                                        <SLABadge sla={b.sla} />
                                    </div>
                                </div>
                                <ChevronRight className="coll-chev" size={20} strokeWidth={2} />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
