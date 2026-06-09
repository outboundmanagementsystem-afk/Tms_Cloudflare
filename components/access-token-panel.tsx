"use client"

import { useEffect, useState, useCallback } from "react"
import { Lock, Clock, CheckCircle, XCircle, Send, AlertCircle } from "lucide-react"
import {
    createAccessTokenRequest,
    getAccessTokensForItinerary,
    approveAccessToken,
    rejectAccessToken,
    type AccessToken,
} from "@/lib/firestore"

interface AccessTokenPanelProps {
    itineraryId: string
    itineraryStatus: string
    currentUserRole: string
    currentUserId: string
    currentUserName: string
    onAccessChange: (hasAccess: boolean) => void
}

// Sales/sales_lead need a token when status moves past "sent"
const LOCKED_STATUSES = ["handover", "pre-ops", "post-ops"]

function isRequestor(role: string, status: string): boolean {
    const salesRoles = ["sales", "sales_lead"]
    const preOpsRoles = ["pre_ops", "pre_ops_lead"]
    if (salesRoles.includes(role) && LOCKED_STATUSES.includes(status)) return true
    if (preOpsRoles.includes(role) && status === "post-ops") return true
    return false
}

function isApprover(role: string, status: string): boolean {
    if (role === "admin" || role === "owner") return true
    const preOpsRoles = ["pre_ops", "pre_ops_lead"]
    const postOpsRoles = ["post_ops", "post_ops_lead"]
    if (preOpsRoles.includes(role) && (status === "handover" || status === "pre-ops")) return true
    if (postOpsRoles.includes(role) && status === "post-ops") return true
    return false
}

function ownerLabel(status: string): string {
    if (status === "post-ops") return "Post-Ops"
    return "Pre-Ops"
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

function expiryText(expiresAt?: string): string {
    if (!expiresAt) return ""
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return "expired"
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `expires in ${h}h ${m}m` : `expires in ${m}m`
}

export function AccessTokenPanel({
    itineraryId,
    itineraryStatus,
    currentUserRole,
    currentUserId,
    currentUserName,
    onAccessChange,
}: AccessTokenPanelProps) {
    const [tokens, setTokens] = useState<AccessToken[]>([])
    const [loading, setLoading] = useState(true)
    const [reason, setReason] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    const canRequest = isRequestor(currentUserRole, itineraryStatus)
    const canApprove = isApprover(currentUserRole, itineraryStatus)
    const relevant = LOCKED_STATUSES.includes(itineraryStatus) && (canRequest || canApprove)

    const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

    useEffect(() => {
        if (!relevant) { setLoading(false); return }
        let cancelled = false
        const load = async () => {
            try {
                const data = await getAccessTokensForItinerary(itineraryId)
                if (cancelled) return
                setTokens(data)
                const now = new Date().toISOString()
                const myActive = data.find(
                    t => t.requestedBy === currentUserId &&
                         t.status === "approved" &&
                         (!t.expiresAt || t.expiresAt > now)
                )
                onAccessChange(!!myActive)
            } catch { /* silent */ }
            finally { if (!cancelled) setLoading(false) }
        }
        load()
        return () => { cancelled = true }
    }, [itineraryId, relevant, refreshKey])

    if (!relevant || loading) return null

    const myLatest = tokens
        .filter(t => t.requestedBy === currentUserId)
        .sort((a, b) => (b.requestedAt > a.requestedAt ? 1 : -1))[0]

    const pendingCount = tokens.filter(t => t.status === "pending").length
    const othersTokens = tokens
        .filter(t => t.requestedBy !== currentUserId)
        .sort((a, b) => (b.requestedAt > a.requestedAt ? 1 : -1))

    const handleRequest = async () => {
        if (!reason.trim() || submitting) return
        setSubmitting(true)
        try {
            await createAccessTokenRequest(itineraryId, currentUserId, currentUserName, currentUserRole, reason.trim())
            setReason("")
            refresh()
        } catch { /* silent */ }
        finally { setSubmitting(false) }
    }

    const handleApprove = async (tokenId: string) => {
        await approveAccessToken(tokenId, currentUserId, currentUserName)
        refresh()
    }

    const handleReject = async (tokenId: string) => {
        await rejectAccessToken(tokenId, currentUserId, currentUserName)
        refresh()
    }

    return (
        <div className="space-y-3">
            {/* ── REQUEST PANEL (for the person who needs access) ── */}
            {canRequest && (
                <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                    <div className="flex items-center gap-2 mb-3">
                        <Lock className="w-4 h-4 text-amber-500" />
                        <span className="font-sans text-xs font-bold uppercase tracking-wider text-amber-700">Edit Access Required</span>
                    </div>

                    {/* No request yet, or previous was rejected */}
                    {(!myLatest || myLatest.status === "rejected") && (
                        <div className="space-y-3">
                            <p className="font-sans text-xs text-gray-500">
                                This itinerary is now managed by <strong>{ownerLabel(itineraryStatus)}</strong>. Raise a request to get temporary edit access (valid 24 h once approved).
                            </p>
                            {myLatest?.status === "rejected" && (
                                <p className="font-sans text-xs text-red-500 flex items-center gap-1.5">
                                    <XCircle className="w-3.5 h-3.5" /> Your previous request was declined by {myLatest.approvedByName}.
                                </p>
                            )}
                            <div className="flex gap-2">
                                <input
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleRequest()}
                                    placeholder="Reason for edit access..."
                                    className="flex-1 px-3 py-2 rounded-xl font-sans text-xs outline-none"
                                    style={{ border: '1px solid rgba(5,34,16,0.12)', background: '#f8faf9' }}
                                />
                                <button
                                    onClick={handleRequest}
                                    disabled={!reason.trim() || submitting}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-sans text-[10px] font-bold uppercase tracking-wider transition-all"
                                    style={{
                                        background: reason.trim() ? '#06a15c' : '#e2e8f0',
                                        color: reason.trim() ? '#fff' : '#94a3b8',
                                        cursor: reason.trim() ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    <Send className="w-3 h-3" />
                                    {submitting ? "Sending…" : "Request"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Pending */}
                    {myLatest?.status === "pending" && (
                        <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                            <div>
                                <p className="font-sans text-xs font-semibold text-amber-700">Access request pending approval</p>
                                <p className="font-sans text-[11px] text-gray-400 mt-0.5">
                                    "{myLatest.reason}" · sent {timeAgo(myLatest.requestedAt)}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Approved */}
                    {myLatest?.status === "approved" && (myLatest.expiresAt ?? "") > new Date().toISOString() && (
                        <div className="flex items-center gap-3">
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div>
                                <p className="font-sans text-xs font-semibold text-emerald-700">Edit access granted</p>
                                <p className="font-sans text-[11px] text-gray-400 mt-0.5">
                                    Approved by {myLatest.approvedByName} · {expiryText(myLatest.expiresAt)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── APPROVAL PANEL (for the current owner) ── */}
            {canApprove && othersTokens.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className={`w-4 h-4 ${pendingCount > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
                        <span className="font-sans text-xs font-bold uppercase tracking-wider text-gray-600">
                            Access Requests
                        </span>
                        {pendingCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full font-sans text-[10px] font-bold bg-amber-100 text-amber-700">
                                {pendingCount} pending
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        {othersTokens.map(token => (
                            <div
                                key={token.id}
                                className="flex items-start justify-between gap-3 rounded-xl p-3"
                                style={{
                                    background: token.status === "pending" ? "rgba(251,191,36,0.04)" : "#f8faf9",
                                    border: `1px solid ${token.status === "pending" ? "rgba(251,191,36,0.2)" : "rgba(5,34,16,0.06)"}`,
                                }}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-sans text-[11px] font-bold text-gray-700">{token.requestedByName}</span>
                                        <span className="font-sans text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(5,34,16,0.06)', color: 'rgba(5,34,16,0.45)' }}>
                                            {token.requestedByRole.replace(/_/g, " ")}
                                        </span>
                                    </div>
                                    <p className="font-sans text-[11px] text-gray-500 mt-0.5">"{token.reason}"</p>
                                    <p className="font-sans text-[10px] text-gray-400 mt-0.5">
                                        {timeAgo(token.requestedAt)}
                                        {token.status !== "pending" && ` · ${token.status} by ${token.approvedByName}`}
                                    </p>
                                </div>
                                {token.status === "pending" ? (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleApprove(token.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-sans text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                                        >
                                            <CheckCircle className="w-3 h-3" /> Approve
                                        </button>
                                        <button
                                            onClick={() => handleReject(token.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-sans text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all"
                                        >
                                            <XCircle className="w-3 h-3" /> Reject
                                        </button>
                                    </div>
                                ) : (
                                    <span className={`shrink-0 font-sans text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${token.status === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                                        {token.status}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
