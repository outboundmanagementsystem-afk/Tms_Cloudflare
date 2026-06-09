"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getPendingTokensWithItineraries, approveAccessToken, rejectAccessToken } from "@/lib/firestore"
import Link from "next/link"
import { Key, CheckCircle, XCircle, Clock, MapPin, RefreshCw } from "lucide-react"

export default function PostOpsPendingTokensPage() {
    return (
        <ProtectedRoute allowedRoles={["post_ops", "post_ops_lead", "admin"]}>
            <PendingTokens />
        </ProtectedRoute>
    )
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

const ROLE_LABEL: Record<string, string> = {
    sales: "Sales",
    sales_lead: "Sales Lead",
    pre_ops: "Pre-Ops",
    pre_ops_lead: "Pre-Ops Lead",
}

function PendingTokens() {
    const { userProfile } = useAuth()
    const [tokens, setTokens] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [acting, setActing] = useState<string | null>(null)
    const [filter, setFilter] = useState<"all" | "sales" | "pre_ops">("all")

    const load = async () => {
        setLoading(true)
        try {
            const all = await getPendingTokensWithItineraries()
            // Post-ops approves tokens for itineraries in post-ops status
            const mine = all.filter(t =>
                t.itinerary &&
                t.itinerary.status === "post-ops"
            )
            setTokens(mine)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const handleApprove = async (tokenId: string) => {
        if (!userProfile) return
        setActing(tokenId)
        try {
            await approveAccessToken(tokenId, userProfile.uid, userProfile.name || userProfile.email || "")
            await load()
        } catch (e) { console.error(e) }
        finally { setActing(null) }
    }

    const handleReject = async (tokenId: string) => {
        if (!userProfile) return
        setActing(tokenId)
        try {
            await rejectAccessToken(tokenId, userProfile.uid, userProfile.name || userProfile.email || "")
            await load()
        } catch (e) { console.error(e) }
        finally { setActing(null) }
    }

    const salesRoles = ["sales", "sales_lead"]
    const preOpsRoles = ["pre_ops", "pre_ops_lead"]

    const filtered = tokens.filter(t => {
        if (filter === "sales") return salesRoles.includes(t.requestedByRole)
        if (filter === "pre_ops") return preOpsRoles.includes(t.requestedByRole)
        return true
    })

    const salesCount = tokens.filter(t => salesRoles.includes(t.requestedByRole)).length
    const preOpsCount = tokens.filter(t => preOpsRoles.includes(t.requestedByRole)).length

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>Pending Tokens</h1>
                    <p className="font-sans text-sm mt-1" style={{ color: 'rgba(5,34,16,0.5)' }}>
                        Edit access requests from Sales & Pre-Ops waiting for your approval
                    </p>
                </div>
                <button
                    onClick={load}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-sans text-xs font-bold uppercase tracking-wider transition-all hover:scale-105"
                    style={{ background: 'rgba(6,161,92,0.08)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.15)' }}
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {/* Filter tabs */}
            {!loading && tokens.length > 0 && (
                <div className="flex items-center gap-2">
                    {([
                        { key: "all", label: `All (${tokens.length})` },
                        { key: "sales", label: `Sales (${salesCount})` },
                        { key: "pre_ops", label: `Pre-Ops (${preOpsCount})` },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className="px-4 py-1.5 rounded-full font-sans text-xs font-bold uppercase tracking-wider transition-all"
                            style={{
                                background: filter === tab.key ? '#06a15c' : 'rgba(5,34,16,0.05)',
                                color: filter === tab.key ? '#fff' : 'rgba(5,34,16,0.5)',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: '#fff', border: '1px solid rgba(5,34,16,0.06)' }}>
                    <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mb-4">
                        <Key className="w-6 h-6 text-teal-400" />
                    </div>
                    <p className="font-sans text-sm font-semibold text-gray-500">No pending access requests</p>
                    <p className="font-sans text-xs text-gray-400 mt-1">Edit requests from Sales and Pre-Ops will appear here</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(token => {
                        const isSales = salesRoles.includes(token.requestedByRole)
                        const roleColor = isSales ? { bg: 'rgba(99,102,241,0.08)', text: '#4f46e5' } : { bg: 'rgba(14,165,233,0.08)', text: '#0284c7' }
                        return (
                            <div
                                key={token.id}
                                className="rounded-2xl p-5"
                                style={{ background: '#fff', border: '1px solid rgba(251,191,36,0.2)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}
                            >
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="space-y-2 flex-1 min-w-0">
                                        {/* Itinerary info */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link
                                                href={`/post-ops/booking/${token.itineraryId}`}
                                                className="font-sans text-sm font-bold text-teal-800 hover:text-teal-600 transition-colors"
                                            >
                                                {token.itinerary?.customerName || "Unknown"}
                                            </Link>
                                            {token.itinerary?.quoteId && (
                                                <span className="font-sans text-[9px] font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100 uppercase tracking-widest">
                                                    {token.itinerary.quoteId}
                                                </span>
                                            )}
                                            <span className="font-sans text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                                                style={{ background: 'rgba(20,184,166,0.08)', color: '#0f766e' }}>
                                                post-ops
                                            </span>
                                        </div>
                                        {token.itinerary?.destination && (
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="w-3 h-3 text-teal-400" />
                                                <span className="font-sans text-xs text-gray-500">{token.itinerary.destination}</span>
                                            </div>
                                        )}
                                        {/* Requester info */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: roleColor.bg }}>
                                                <span className="font-sans text-[9px] font-bold" style={{ color: roleColor.text }}>
                                                    {(token.requestedByName || "?")[0].toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="font-sans text-xs font-semibold text-gray-700">{token.requestedByName}</span>
                                            <span className="font-sans text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold"
                                                style={{ background: roleColor.bg, color: roleColor.text }}>
                                                {ROLE_LABEL[token.requestedByRole] || token.requestedByRole}
                                            </span>
                                            <Clock className="w-3 h-3 text-gray-300" />
                                            <span className="font-sans text-[10px] text-gray-400">{timeAgo(token.requestedAt)}</span>
                                        </div>
                                        {/* Reason */}
                                        <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                                            <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-0.5">Reason</span>
                                            <p className="font-sans text-xs text-gray-600">"{token.reason}"</p>
                                        </div>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleApprove(token.id)}
                                            disabled={acting === token.id}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-sans text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            {acting === token.id ? "…" : "Approve"}
                                        </button>
                                        <button
                                            onClick={() => handleReject(token.id)}
                                            disabled={acting === token.id}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-sans text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all disabled:opacity-50"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            {acting === token.id ? "…" : "Reject"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
