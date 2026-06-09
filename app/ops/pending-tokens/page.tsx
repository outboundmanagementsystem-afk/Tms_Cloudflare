"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getPendingTokensWithItineraries, approveAccessToken, rejectAccessToken } from "@/lib/firestore"
import Link from "next/link"
import { Key, CheckCircle, XCircle, Clock, ArrowLeft, MapPin, RefreshCw } from "lucide-react"

export default function PreOpsPendingTokensPage() {
    return (
        <ProtectedRoute allowedRoles={["pre_ops", "pre_ops_lead", "admin"]}>
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

function PendingTokens() {
    const { userProfile } = useAuth()
    const [tokens, setTokens] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [acting, setActing] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        try {
            const all = await getPendingTokensWithItineraries()
            // Pre-ops approves tokens for itineraries in handover or pre-ops status
            const mine = all.filter(t =>
                t.itinerary &&
                ["handover", "pre-ops"].includes(t.itinerary.status)
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

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>Pending Tokens</h1>
                    <p className="font-sans text-sm mt-1" style={{ color: 'rgba(5,34,16,0.5)' }}>
                        Edit access requests from Sales waiting for your approval
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

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
                </div>
            ) : tokens.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: '#fff', border: '1px solid rgba(5,34,16,0.06)' }}>
                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                        <Key className="w-6 h-6 text-emerald-400" />
                    </div>
                    <p className="font-sans text-sm font-semibold text-gray-500">No pending access requests</p>
                    <p className="font-sans text-xs text-gray-400 mt-1">Sales edit requests for your itineraries will appear here</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tokens.map(token => (
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
                                            href={`/ops/booking/${token.itineraryId}`}
                                            className="font-sans text-sm font-bold text-emerald-800 hover:text-emerald-600 transition-colors"
                                        >
                                            {token.itinerary?.customerName || "Unknown"}
                                        </Link>
                                        {token.itinerary?.quoteId && (
                                            <span className="font-sans text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 uppercase tracking-widest">
                                                {token.itinerary.quoteId}
                                            </span>
                                        )}
                                        <span className="font-sans text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                                            style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>
                                            {token.itinerary?.status}
                                        </span>
                                    </div>
                                    {token.itinerary?.destination && (
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3 h-3 text-emerald-400" />
                                            <span className="font-sans text-xs text-gray-500">{token.itinerary.destination}</span>
                                        </div>
                                    )}
                                    {/* Requester info */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <span className="font-sans text-[9px] font-bold text-indigo-600">
                                                {(token.requestedByName || "?")[0].toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="font-sans text-xs font-semibold text-gray-700">{token.requestedByName}</span>
                                        <span className="font-sans text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                                            style={{ background: 'rgba(5,34,16,0.06)', color: 'rgba(5,34,16,0.45)' }}>
                                            {token.requestedByRole.replace(/_/g, " ")}
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
                    ))}
                </div>
            )}
        </div>
    )
}
