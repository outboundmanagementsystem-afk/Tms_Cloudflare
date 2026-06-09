"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useCallback } from "react"
import { getItineraries, getItineraryPayments, addPayment } from "@/lib/firestore"
import { useAuth } from "@/lib/auth-context"
import { deriveBooking, mapPayment, methodValue, typeValue, fmtINR, type DerivedBooking } from "@/lib/finance/derive"
import { StatusPill, Progress, SearchBox, EmptyState } from "@/components/finance/ui"
import { PaymentDrawer, type RecordPayload } from "@/components/finance/payment-drawer"
import { Plus, SearchX } from "lucide-react"

const FILTERS = [
    { id: "all", label: "All" },
    { id: "unpaid", label: "Unpaid" },
    { id: "partial", label: "Partial" },
    { id: "paid", label: "Fully Paid" },
] as const
type FilterId = (typeof FILTERS)[number]["id"]

export default function FinancePaymentsPage() {
    return (
        <ProtectedRoute allowedRoles={["finance", "finance_lead", "admin", "owner"]}>
            <PaymentsContent />
        </ProtectedRoute>
    )
}

function PaymentsContent() {
    const { userProfile } = useAuth()
    const [raw, setRaw] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [filter, setFilter] = useState<FilterId>("all")

    // drawer
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerBooking, setDrawerBooking] = useState<DerivedBooking | null>(null)
    const [focusRecord, setFocusRecord] = useState(false)
    const [loadingLedger, setLoadingLedger] = useState(false)
    const [recording, setRecording] = useState(false)

    const load = useCallback(async () => {
        try {
            const all = await getItineraries()
            setRaw(all.filter((i: any) => i.status && i.status !== "draft"))
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const bookings = raw.map((i) => deriveBooking(i))

    const counts = {
        all: bookings.length,
        unpaid: bookings.filter((b) => b.status === "UNPAID").length,
        partial: bookings.filter((b) => b.status === "PARTIAL").length,
        paid: bookings.filter((b) => b.status === "PAID").length,
    }

    let rows = bookings.filter((b) => {
        if (filter === "unpaid") return b.status === "UNPAID"
        if (filter === "partial") return b.status === "PARTIAL"
        if (filter === "paid") return b.status === "PAID"
        return true
    })
    if (search) {
        const q = search.toLowerCase()
        rows = rows.filter((b) => `${b.client.name} ${b.destination} ${b.code}`.toLowerCase().includes(q))
    }

    const openBooking = useCallback(async (id: string, focus: boolean) => {
        const itin = raw.find((i) => i.id === id)
        if (!itin) return
        setFocusRecord(focus)
        setDrawerOpen(true)
        setLoadingLedger(true)
        setDrawerBooking(deriveBooking(itin)) // quick render with stored amountPaid
        try {
            const pays = await getItineraryPayments(id)
            const mapped = pays.map(mapPayment)
            setDrawerBooking(deriveBooking(itin, mapped))
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingLedger(false)
        }
    }, [raw])

    const closeDrawer = () => { setDrawerOpen(false); setFocusRecord(false) }

    const handleRecord = async (id: string, p: RecordPayload) => {
        setRecording(true)
        try {
            await addPayment(id, {
                type: typeValue(p.type),
                amount: p.amount,
                method: methodValue(p.method),
                stage: p.stage,
                verification: p.verification,
                collectedBy: userProfile?.uid || "",
                collectedByName: p.collectedBy || userProfile?.name || "",
                collectedAt: `${p.date}T00:00:00.000Z`,
            } as any)
            // refresh list + drawer ledger
            const all = await getItineraries()
            const active = all.filter((i: any) => i.status && i.status !== "draft")
            setRaw(active)
            const itin = active.find((i: any) => i.id === id)
            if (itin) {
                const pays = await getItineraryPayments(id)
                setDrawerBooking(deriveBooking(itin, pays.map(mapPayment)))
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to record payment: " + (e?.message || "unknown error"))
        } finally {
            setRecording(false)
        }
    }

    const userName = userProfile?.name || "—"

    return (
        <div className="fin-scope">
            <div className="page">
                <div className="page-head">
                    <div className="grow">
                        <h1 className="page-title">Payments</h1>
                        <p className="page-sub">Manage all client payments and balances</p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    <div className="chips">
                        {FILTERS.map((f) => (
                            <button key={f.id} className={"chip" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
                                {f.label}
                                <span className="ct tnum">{counts[f.id]}</span>
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1 }} />
                    <SearchBox value={search} onChange={setSearch} placeholder="Search payments…" style={{ width: 300 }} />
                </div>

                <div className="card table-card">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Destination</th>
                                    <th className="num">Total</th>
                                    <th style={{ width: 180 }}>Collected</th>
                                    <th className="num">Balance</th>
                                    <th>Status</th>
                                    <th style={{ width: 56 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7}><div style={{ padding: "48px 20px", textAlign: "center" }}><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#0f8a5f", borderTopColor: "transparent" }} /></div></td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan={7}><EmptyState icon={SearchX} title="No matching bookings" sub="Try a different search term or filter." padding="48px 20px" /></td></tr>
                                ) : (
                                    rows.map((b) => (
                                        <tr key={b.id} className="clickable" onClick={() => openBooking(b.id, false)}>
                                            <td>
                                                <div className="cell-primary">{b.client.title} {b.client.name}</div>
                                                <div className="cell-sub tnum">{b.code}</div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{b.destination}</div>
                                                <div className="cell-sub">{b.duration}</div>
                                            </td>
                                            <td className="num amount-strong tnum">{fmtINR(b.total)}</td>
                                            <td>
                                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
                                                    <span className="tnum" style={{ color: "var(--fg2)" }}>{fmtINR(b.collected)}</span>
                                                    <span className="tnum" style={{ color: "var(--fg3)" }}>{b.percent}%</span>
                                                </div>
                                                <Progress pct={b.percent} mini tone={b.status === "PAID" ? "green" : b.percent === 0 ? "red" : "amber"} />
                                            </td>
                                            <td className="num tnum">
                                                {b.balance > 0 ? <span className="amount-red">{fmtINR(b.balance)}</span> : <span style={{ color: "var(--fg3)" }}>{fmtINR(0)}</span>}
                                            </td>
                                            <td><StatusPill status={b.status} /></td>
                                            <td className="num">
                                                <button className="row-action" title="Record payment" onClick={(e) => { e.stopPropagation(); openBooking(b.id, true) }}>
                                                    <Plus size={17} strokeWidth={2.4} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <PaymentDrawer
                booking={drawerBooking}
                open={drawerOpen}
                onClose={closeDrawer}
                focusRecord={focusRecord}
                userName={userName}
                onRecord={handleRecord}
                recording={recording}
                loadingLedger={loadingLedger}
            />
        </div>
    )
}
