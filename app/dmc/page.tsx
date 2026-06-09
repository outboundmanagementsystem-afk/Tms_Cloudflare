"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getDmcRecords, getSettings, updateSettings } from "@/lib/firestore"
import Link from "next/link"
import { Building2, Phone, FileText, Search, IndianRupee, Users, Briefcase, ChevronRight, ExternalLink, Star } from "lucide-react"

const ALLOWED = ["admin", "owner", "sales", "sales_lead", "pre_ops", "pre_ops_lead", "ops", "ops_lead", "post_ops", "post_ops_lead"]

export default function DmcManagementPage() {
    return (
        <ProtectedRoute allowedRoles={ALLOWED as any}>
            <DmcManagement />
        </ProtectedRoute>
    )
}

const isUrl = (s: string) => /^https?:\/\//i.test(s || "")
const num = (s: string) => { const n = Number(String(s || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0 }

function bookingLink(role: string, id: string) {
    if (["pre_ops", "pre_ops_lead", "ops", "ops_lead"].includes(role)) return `/ops/booking/${id}`
    if (["post_ops", "post_ops_lead"].includes(role)) return `/post-ops/booking/${id}`
    return `/sales/itinerary/${id}`
}

const subtitleFor = (role: string) => {
    if (role === "admin" || role === "owner") return "All DMC vendors across every booking"
    if (role === "sales_lead") return "DMCs across your team's bookings"
    if (role === "sales") return "DMCs from the bookings you created"
    if (role === "pre_ops_lead" || role === "ops_lead") return "DMCs for your team's assigned bookings"
    if (role === "pre_ops" || role === "ops") return "DMCs for the bookings assigned to you"
    if (role === "post_ops" || role === "post_ops_lead") return "DMCs for bookings in post-operations"
    return "DMC vendor details"
}

function DmcManagement() {
    const { userProfile } = useAuth()
    const role = userProfile?.role || ""
    const [records, setRecords] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    // Per-DMC quality rating (keyed by DMC name, lowercased) — a shared referral signal.
    const [ratings, setRatings] = useState<Record<string, number>>({})
    const canRate = ["admin", "owner", "sales_lead", "pre_ops_lead", "post_ops_lead", "ops_lead"].includes(role)

    useEffect(() => {
        if (!userProfile?.uid) return
        setLoading(true)
        getDmcRecords(role, userProfile.uid)
            .then((r: any) => setRecords(Array.isArray(r) ? r : []))
            .catch(() => setRecords([]))
            .finally(() => setLoading(false))
        getSettings("dmcRatings").then((s: any) => { if (s && typeof s === "object") setRatings(s) }).catch(() => {})
    }, [role, userProfile?.uid])

    const setRating = async (dmcName: string, value: number) => {
        if (!canRate) return
        const key = (dmcName || "").toLowerCase()
        const next = { ...ratings, [key]: value }
        setRatings(next)
        try { const { id, ...clean } = next as any; await updateSettings("dmcRatings", clean) } catch { /* ignore */ }
    }

    // Pre/Post-Ops and leads/admin should see who booked it.
    const showSalesPerson = role !== "sales"

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return records
        return records.filter(r =>
            [r.dmcName, r.dmcContact, r.customerName, r.salesName, r.destination].some((v: string) => (v || "").toLowerCase().includes(q)))
    }, [records, search])

    // Group by DMC name so admins see "how many bookings / by which person".
    const groups = useMemo(() => {
        const map = new Map<string, { name: string; contacts: Set<string>; total: number; items: any[] }>()
        for (const r of filtered) {
            const key = (r.dmcName || "—").toLowerCase()
            if (!map.has(key)) map.set(key, { name: r.dmcName || "—", contacts: new Set(), total: 0, items: [] })
            const g = map.get(key)!
            if (r.dmcContact) g.contacts.add(r.dmcContact)
            g.total += num(r.dmcAmount)
            g.items.push(r)
        }
        return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length)
    }, [filtered])

    const stats = useMemo(() => ({
        dmcs: groups.length,
        bookings: filtered.length,
        value: filtered.reduce((s, r) => s + num(r.dmcAmount), 0),
    }), [groups, filtered])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: "#052210" }}>DMC Management</h1>
                <p className="font-sans text-sm mt-1" style={{ color: "rgba(5,34,16,0.5)" }}>{subtitleFor(role)}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: "DMC Vendors", value: stats.dmcs, icon: Building2, color: "#06a15c" },
                    { label: "Bookings", value: stats.bookings, icon: Briefcase, color: "#3182CE" },
                    { label: "Total DMC Value", value: `₹${stats.value.toLocaleString()}`, icon: IndianRupee, color: "#b45309" },
                ].map(s => (
                    <div key={s.label} className="rounded-2xl bg-white p-5 flex items-center gap-4" style={{ border: "1px solid rgba(5,34,16,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${s.color}14` }}>
                            <s.icon className="w-5 h-5" style={{ color: s.color }} />
                        </div>
                        <div>
                            <p className="font-sans text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(5,34,16,0.4)" }}>{s.label}</p>
                            <p className="font-serif text-2xl font-bold" style={{ color: "#052210" }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search DMC, customer, sales, destination…"
                    className="w-full pl-11 pr-4 py-3 rounded-xl font-sans text-sm bg-white outline-none focus:border-[#1D9E75]"
                    style={{ border: "1px solid rgba(5,34,16,0.12)" }}
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#06a15c", borderTopColor: "transparent" }} />
                </div>
            ) : groups.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: "1px solid rgba(5,34,16,0.06)" }}>
                    <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(6,161,92,0.25)" }} />
                    <p className="font-sans text-sm font-semibold" style={{ color: "#052210" }}>No DMC records yet</p>
                    <p className="font-sans text-xs mt-1" style={{ color: "rgba(5,34,16,0.45)" }}>DMC details appear here once sales fill the DMC items in the handover checklist.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {groups.map((g, gi) => (
                        <div key={gi} className="rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid rgba(5,34,16,0.07)", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
                            {/* DMC header */}
                            <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ background: "#f8faf9", borderBottom: "1px solid rgba(5,34,16,0.05)" }}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(6,161,92,0.1)" }}>
                                        <Building2 className="w-5 h-5" style={{ color: "#06a15c" }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-serif text-lg font-bold truncate" style={{ color: "#052210" }}>{g.name}</p>
                                        {g.contacts.size > 0 && (
                                            <p className="font-sans text-[12px] flex items-center gap-1.5" style={{ color: "rgba(5,34,16,0.55)" }}>
                                                <Phone className="w-3 h-3" /> {Array.from(g.contacts).join(", ")}
                                            </p>
                                        )}
                                        {/* DMC quality rating — referral signal for sales */}
                                        {(() => {
                                            const rkey = (g.name || "").toLowerCase()
                                            const val = ratings[rkey] || 0
                                            return (
                                                <div className="flex items-center gap-0.5 mt-1" title={canRate ? "Rate this DMC" : `Rated ${val}/5`}>
                                                    {[1, 2, 3, 4, 5].map(n => (
                                                        <button
                                                            key={n}
                                                            type="button"
                                                            disabled={!canRate}
                                                            onClick={() => setRating(g.name, n === val ? 0 : n)}
                                                            className={canRate ? "cursor-pointer" : "cursor-default"}
                                                        >
                                                            <Star className="w-3.5 h-3.5" style={{ color: n <= val ? "#f59e0b" : "#d1d5db", fill: n <= val ? "#f59e0b" : "none" }} />
                                                        </button>
                                                    ))}
                                                    <span className="font-sans text-[10px] ml-1" style={{ color: "rgba(5,34,16,0.4)" }}>{val > 0 ? `${val}/5` : "Unrated"}</span>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full font-sans text-[11px] font-bold" style={{ background: "rgba(49,130,206,0.1)", color: "#3182CE" }}>{g.items.length} booking{g.items.length > 1 ? "s" : ""}</span>
                                    {g.total > 0 && <span className="px-3 py-1 rounded-full font-sans text-[11px] font-bold" style={{ background: "rgba(180,83,9,0.1)", color: "#b45309" }}>₹{g.total.toLocaleString()}</span>}
                                </div>
                            </div>
                            {/* Bookings */}
                            <div className="divide-y" style={{ borderColor: "rgba(5,34,16,0.05)" }}>
                                {g.items.map((r: any, i: number) => (
                                    <div key={i} className="px-5 py-3 hover:bg-gray-50/60 transition-colors">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Link href={bookingLink(role, r.itineraryId)} className="font-sans text-sm font-bold hover:underline" style={{ color: "#052210" }}>{r.customerName || "Booking"}</Link>
                                                    {r.status && <span className="px-2 py-0.5 rounded font-sans text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(5,34,16,0.05)", color: "rgba(5,34,16,0.5)" }}>{r.status}</span>}
                                                </div>
                                                <p className="font-sans text-[11px] mt-0.5" style={{ color: "rgba(5,34,16,0.5)" }}>
                                                    {r.destination}
                                                    {showSalesPerson && r.salesName ? <> · Booked by <span className="font-semibold" style={{ color: "#06a15c" }}>{r.salesName}</span></> : null}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                {r.dmcAmount ? <span className="font-serif text-sm font-bold" style={{ color: "#b45309" }}>₹{num(r.dmcAmount).toLocaleString()}</span> : null}
                                                {r.dmcQuote && isUrl(r.dmcQuote) ? (
                                                    <a href={r.dmcQuote} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-sans text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(6,161,92,0.1)", color: "#06a15c", border: "1px solid rgba(6,161,92,0.2)" }}>
                                                        <FileText className="w-3 h-3" /> Quote <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : null}
                                                <Link href={bookingLink(role, r.itineraryId)} className="text-gray-300 hover:text-[#06a15c]"><ChevronRight className="w-4 h-4" /></Link>
                                            </div>
                                        </div>
                                        {/* Text quote (not a PDF) — shown in full on its own line so nothing is clipped */}
                                        {r.dmcQuote && !isUrl(r.dmcQuote) ? (
                                            <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: "#f8faf9", border: "1px solid rgba(5,34,16,0.06)" }}>
                                                <span className="font-sans text-[9px] font-bold uppercase tracking-wider" style={{ color: "rgba(5,34,16,0.4)" }}>DMC Quote: </span>
                                                <span className="font-sans text-[12px] whitespace-pre-wrap break-words" style={{ color: "#052210" }}>{r.dmcQuote}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
