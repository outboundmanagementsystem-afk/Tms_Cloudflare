"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { useDialog } from "@/components/dialog-provider"
import { useAuth } from "@/lib/auth-context"
import {
    getItinerary, getSopChecklist, getSalesChecklist, updateSopItem, updateItineraryStatus, initPostOpsChecklist, initSopChecklist,
    getItineraryDays, getItineraryHotels, getItineraryTransfers, getItineraryPricing, getItineraryFlights, getItineraryActivities, syncChecklist,
    getUsers, updateItinerary
} from "@/lib/firestore"

import Link from "next/link"
import TripNotes from "@/components/trip-notes"
import { AccessTokenPanel } from "@/components/access-token-panel"
import { ArrowLeft, CheckCircle, Circle, Package, FileText, Eye, Download, Share2, FileEdit, X, UploadCloud, Calendar, AlertCircle, Lock } from "lucide-react"
import { UpsellDownsellControl, UpsellHistory } from "@/components/upsell-downsell"
import { FilePreview } from "@/components/file-preview"

export default function BookingDetailPage() {
    return (
        <ProtectedRoute allowedRoles={["pre_ops", "pre_ops_lead", "admin"]}>
            <BookingDetail />
        </ProtectedRoute>
    )
}

function BookingDetail() {
    const { userProfile } = useAuth()
    const params = useParams()
    const { showDialog } = useDialog()
    const bookingId = params.id as string
    const [booking, setBooking] = useState<any>(null)
    const [checklist, setChecklist] = useState<any[]>([])
    const [days, setDays] = useState<any[]>([])
    const [hotels, setHotels] = useState<any[]>([])
    const [transfers, setTransfers] = useState<any[]>([])
    const [pricing, setPricing] = useState<any[]>([])
    const [flights, setFlights] = useState<any[]>([])
    const [activities, setActivities] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
    const [salesChecklist, setSalesChecklist] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<'trip'|'notes'|'handover'|'checklist'>('trip')
    // Sales handover must be acknowledged before the Pre-Ops checklist tab unlocks.
    const [handoverAcknowledged, setHandoverAcknowledged] = useState(false)
    const [preOpsTeam, setPreOpsTeam] = useState<any[]>([])
    const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
    const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [hasTokenAccess, setHasTokenAccess] = useState(false)

    useEffect(() => {
        return () => { if (highlightTimeout.current) clearTimeout(highlightTimeout.current) }
    }, [])

    const showFirstPending = useCallback(() => {
        const firstPending = checklist.find(c => c.isRequired !== false && !c.checked)
        if (!firstPending) return
        itemRefs.current[firstPending.id]?.scrollIntoView({ behavior: "smooth", block: "center" })
        setHighlightedItemId(firstPending.id)
        if (highlightTimeout.current) clearTimeout(highlightTimeout.current)
        highlightTimeout.current = setTimeout(() => setHighlightedItemId(null), 5000)
    }, [checklist])

    useEffect(() => { loadData() }, [bookingId])

    const loadData = async () => {
        try {
            const bk = await getItinerary(bookingId)
            setBooking(bk)
            setHandoverAcknowledged(!!(bk as any)?.preOpsHandoverAcknowledged)

            const allUsers = await getUsers()
            const team = allUsers.filter((u: any) => ["pre_ops", "pre_ops_lead", "preops", "pre-ops"].includes(u.role))
            setPreOpsTeam(team)

            const [d, h, t, p, f, a] = await Promise.all([
                getItineraryDays(bookingId),
                getItineraryHotels(bookingId),
                getItineraryTransfers(bookingId),
                getItineraryPricing(bookingId),
                getItineraryFlights(bookingId),
                getItineraryActivities(bookingId),
            ])
            setDays(d)
            setHotels(h)
            setTransfers(t)
            setPricing(p)
            setFlights(f)
            setActivities(a)

            try { const sc = await getSalesChecklist(bookingId); setSalesChecklist(sc) } catch(e) { console.error('sales cl', e) }

            let cl = await getSopChecklist(bookingId)
            let needsSync = true;
            if (cl.length === 0) {
                await initSopChecklist(bookingId)
                cl = await getSopChecklist(bookingId)
                needsSync = false;
            }
            if (needsSync) {
                try {
                    const changed = await syncChecklist(bookingId, "pre_ops", "sopChecklist");
                    if (changed) {
                        cl = await getSopChecklist(bookingId);
                    }
                } catch (syncErr) {
                    console.error("Sync failed:", syncErr)
                }
            }
            
            // Deduplicate items by name to prevent duplicates if they were added multiple times (e.g. during sync)
            const uniqueCl = cl.filter((item: any, index: number, self: any[]) =>
                index === self.findIndex((i) =>
                    (i.name || i.title || "").trim().toLowerCase() ===
                    (item.name || item.title || "").trim().toLowerCase()
                )
            )
            // Show in the admin SOP order. Each item carries `order` = its position in the
            // SOP; DB rows come back in arbitrary (insertion) order, so sort by it here.
            uniqueCl.sort((a: any, b: any) => (Number(a?.order ?? 1e9)) - (Number(b?.order ?? 1e9)))
            setChecklist(uniqueCl)
        } catch (err) { console.error(err) }
        finally { setLoading(false) }
    }

    const toggleItem = async (itemId: string, currentChecked: boolean) => {
        console.log("Toggle Item Clicked:", itemId, "Current state:", currentChecked);
        
        const item = checklist.find(c => c.id === itemId);
        if (!item) return;

        // Validation: If checking (unmarked -> marked) and mandatory input is missing
        if (!currentChecked && item.isRequired !== false) {
            const needsText = ['text_input', 'Text Input', 'text', 'TEXT_INPUT'].includes(item.type) && !item.response;
            const needsFile = ['file_upload', 'File Upload', 'file', 'FILE_UPLOAD'].includes(item.type) && !item.fileUrl;
            
            if (needsText || needsFile) {
                showDialog({
                    title: "Warning",
                    message: `Please ${needsText ? "enter a response" : "upload a file"} before marking this mandatory task as complete.`,
                    type: "warning"
                });
                return;
            }
        }

        try {
            await updateSopItem(bookingId, itemId, {
                checked: !currentChecked,
                updatedAt: new Date().toISOString(),
            })
            const updatedChecklist = checklist.map(c => c.id === itemId ? { ...c, checked: !currentChecked } : c)
            setChecklist(updatedChecklist)
        } catch (err) {
            console.error("Toggle Item Failed:", err);
            showDialog({
                title: "Error",
                message: "Failed to update item. Please check your connection.",
                type: "error"
            });
        }
    }

    const updateSopItemState = async (itemId: string, data: any) => {
        await updateSopItem(bookingId, itemId, data)
        setChecklist(checklist.map(c => c.id === itemId ? { ...c, ...data } : c))
    }

    const handleFileUpload = async (itemId: string, files: FileList | null) => {
        if (!files || files.length === 0) return
        
        const item = checklist.find(c => c.id === itemId)
        const existingUrls = item?.fileUrl ? item.fileUrl.split(',').filter(Boolean) : []
        
        if (existingUrls.length + files.length > 10) {
            showDialog({
                title: "Warning",
                message: `Maximum 10 files allowed. You can only add up to ${10 - existingUrls.length} more file(s).`,
                type: "warning"
            })
            return
        }
        
        setUploadingItemId(itemId)
        try {
            const workerUrl = process.env.NEXT_PUBLIC_R2_WORKER_URL || "https://outbound-storage.outboundmanagementsystem.workers.dev"
            const newUrls: string[] = []
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const url = `${workerUrl.replace(/\/$/, '')}/sops/${bookingId}/${itemId}/${encodeURIComponent(file.name)}`
                
                const response = await fetch(url, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type || "application/octet-stream" }
                })
                if (!response.ok) throw new Error(`Upload failed for ${file.name}`)
                newUrls.push(url)
            }
            
            const updatedUrls = [...existingUrls, ...newUrls].join(',')
            // Uploading a document auto-completes the item — no manual check needed.
            await updateSopItemState(itemId, { fileUrl: updatedUrls, checked: true, updatedAt: new Date().toISOString() })
        } catch (error) {
            console.error("Upload failed", error)
            showDialog({
                title: "Error",
                message: "File upload failed. Please try again.",
                type: "error"
            })
        } finally {
            setUploadingItemId(null)
        }
    }

    const handleHandover = async () => {
        if (booking.status !== "post-ops" && booking.status !== "completed") {
            setLoading(true)
            try {
                await initPostOpsChecklist(bookingId)
                await updateItineraryStatus(bookingId, "post-ops")
                setBooking({ ...booking, status: "post-ops" })
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
        </div>
    )

    if (!booking) return (
        <div className="text-center py-20">
            <p className="font-sans text-sm" style={{ color: 'rgba(5,34,16,0.5)' }}>Booking not found</p>
        </div>
    )

    const requiredChecklist = checklist.filter(c => c.isRequired !== false)
    const completedCount = requiredChecklist.filter(c => c.checked).length
    const progress = requiredChecklist.length > 0 ? Math.round((completedCount / requiredChecklist.length) * 100) : 0

    // Hotel check-in / check-out dates pulled from the sales handover data (shown in the Trip card).
    const normName = (c: any) => (c?.name || c?.title || "").toLowerCase().replace(/[\s_-]/g, "")
    const hotelCheckIn = salesChecklist.find((c: any) => { const n = normName(c); return n.includes("hotel") && n.includes("checkin") })?.response || ""
    const hotelCheckOut = salesChecklist.find((c: any) => { const n = normName(c); return n.includes("hotel") && n.includes("checkout") })?.response || ""

    // Group the sales handover items by category (uses the category stored during sync, with a
    // lightweight keyword fallback for legacy/untagged items). Order follows first appearance.
    const handoverCategoryFallback = (name: string) => {
        const n = (name || "").toLowerCase()
        if (n.includes("dmc") || n.includes("vendor") || n.includes("ticket") || n.includes("flight") || n.includes("train")) return "Vendor Details"
        if (n.includes("visa") || n.includes("passport") || n.includes("insurance") || n.includes("document") || n.includes("requirement")) return "Documents & Travel Requirements"
        if (n.includes("payment") || n.includes("cost") || n.includes("price") || n.includes("invoice")) return "Payment Information"
        if (n.includes("acknowledg") || n.includes("edification") || n.includes("sla")) return "Acknowledgements"
        return "Booking Information"
    }
    const groupedHandover: { key: string; title: string; items: any[] }[] = (() => {
        const byKey: Record<string, { key: string; title: string; items: any[] }> = {}
        const order: { key: string; title: string; items: any[] }[] = []
        salesChecklist.forEach((item: any) => {
            const title = (item.category && String(item.category).trim()) ? String(item.category).trim() : handoverCategoryFallback(item.name || item.title || "")
            const key = title.toLowerCase()
            if (!byKey[key]) { byKey[key] = { key, title, items: [] }; order.push(byKey[key]) }
            byKey[key].items.push(item)
        })
        return order
    })()

    // Acknowledge the sales handover — persists on the booking and unlocks the Pre-Ops checklist.
    const handleAcknowledgeHandover = async () => {
        try {
            await updateItinerary(bookingId, {
                preOpsHandoverAcknowledged: true,
                preOpsHandoverAcknowledgedAt: new Date().toISOString(),
                preOpsHandoverAcknowledgedBy: userProfile?.name || "",
            })
            setHandoverAcknowledged(true)
            setBooking((prev: any) => ({ ...prev, preOpsHandoverAcknowledged: true }))
            showDialog({ title: "Acknowledged", message: "Sales handover data acknowledged. The Pre-Ops Checklist is now enabled.", type: "success" })
            setActiveTab('checklist')
        } catch (e) {
            console.error(e)
            showDialog({ title: "Error", message: "Failed to acknowledge handover. Please try again.", type: "error" })
        }
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <Link href="/ops" className="inline-flex items-center gap-2 font-sans text-xs tracking-wider uppercase" style={{ color: 'rgba(6,161,92,0.6)' }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Pre Operation
            </Link>

            {/* Header */}
            <div className="space-y-3">
                <div>
                    <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>{booking.customerName}</h1>
                    <p className="font-sans text-xs sm:text-sm mt-1" style={{ color: 'rgba(5,34,16,0.6)' }}>{booking.destination} · {booking.nights}N/{booking.days}D · {booking.startDate} → {booking.endDate}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {/* Edit button — locked once itinerary moves to post-ops */}
                    {(() => {
                        const isAdminOrOwner = userProfile?.role === "admin" || userProfile?.role === "owner"
                        const isLocked = booking.status === "post-ops" && !isAdminOrOwner
                        const editUrl = `/sales/itinerary-generator/${booking?.module === 'built-package' ? 'build-package' : 'custom'}?editId=${bookingId}&returnTo=${encodeURIComponent(`/ops/booking/${bookingId}`)}`
                        if (!isLocked || hasTokenAccess) {
                            return (
                                <Link
                                    href={editUrl}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                                    style={{ background: 'rgba(52,211,153,0.1)', color: '#06a15c', border: '1px solid rgba(52,211,153,0.2)' }}
                                >
                                    <FileEdit className="w-3 h-3" /> Edit
                                </Link>
                            )
                        }
                        return (
                            <span
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase"
                                style={{ background: 'rgba(5,34,16,0.04)', color: 'rgba(5,34,16,0.3)', border: '1px solid rgba(5,34,16,0.06)', cursor: 'not-allowed' }}
                            >
                                <Lock className="w-3 h-3" /> Edit
                            </span>
                        )
                    })()}
                    <button
                        onClick={() => window.open(`/voucher/${bookingId}`, '_blank')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                        style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.2)' }}
                    >
                        <FileText className="w-3 h-3" /> Voucher
                    </button>
                    <Link
                        href={`/itinerary/${bookingId}`}
                        target="_blank"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                        style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.2)' }}
                    >
                        <Eye className="w-3 h-3" /> ITINERARY
                    </Link>
                    <UpsellDownsellControl booking={booking} userProfile={userProfile} onSaved={loadData} />
                </div>

                {/* Token panel — visible when status needs a token (post-ops for pre-ops requestors, or handover/pre-ops for pre-ops approvers) */}
                {userProfile && booking && ["handover", "pre-ops", "post-ops"].includes(booking.status) && (
                    <AccessTokenPanel
                        itineraryId={bookingId}
                        itineraryStatus={booking.status}
                        currentUserRole={userProfile.role}
                        currentUserId={userProfile.uid}
                        currentUserName={userProfile.name || userProfile.email || ""}
                        onAccessChange={setHasTokenAccess}
                    />
                )}
            </div>

            {/* Assignment Section */}
            {(userProfile?.role === "admin" || userProfile?.role === "owner" || userProfile?.role === "pre_ops_lead") && (
                <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#f8faf9', border: '1px solid rgba(6,161,92,0.1)' }}>
                    <div>
                        <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-emerald-800">Pre-Ops Assignment Status</p>
                        <p className="font-sans text-xs mt-0.5" style={{ color: 'rgba(5,34,16,0.6)' }}>
                            Assigned to: <strong className="text-emerald-950">{booking.assignedPreOpsName || "None"}</strong> ({booking.assignmentMode || "auto"})
                        </p>
                    </div>
                    <select
                        value={booking.assignedPreOpsId || booking.assignedOps || ""}
                        onChange={async (e) => {
                            const targetEmpId = e.target.value
                            if (!targetEmpId) return
                            const targetEmp = preOpsTeam.find(m => m.uid === targetEmpId)
                            if (!targetEmp) return
                            
                            const { updateItinerary } = await import("@/lib/firestore")
                            await updateItinerary(bookingId, {
                                assignedPreOpsId: targetEmp.uid,
                                assignedPreOpsName: targetEmp.name || "Pre-Ops Employee",
                                assignedPreOpsEmail: targetEmp.email || "",
                                reassignedAt: new Date().toISOString(),
                                reassignedBy: userProfile?.name || "Manager",
                                assignmentMode: "manual",
                                assignedOps: targetEmp.uid
                            })
                            showDialog({
                                title: "Success",
                                message: `Successfully reassigned booking to ${targetEmp.name}.`,
                                type: "success"
                            })
                            loadData()
                        }}
                        className="px-3 py-1.5 rounded-xl font-sans text-xs font-bold outline-none border bg-white"
                        style={{ color: '#06a15c', borderColor: 'rgba(6,161,92,0.2)' }}
                    >
                        <option value="">Reassign employee...</option>
                        {preOpsTeam.map((m: any) => (
                            <option key={m.uid} value={m.uid}>{m.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Handover Complete Banner (Persistent) */}
            {(booking.status === "post-ops" || booking.status === "completed") && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#34d399' }} />
                    <div>
                        <span className="font-sans text-sm font-bold block" style={{ color: '#052210' }}>Handover Complete</span>
                        <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}>This booking is now managed by the Post-Operation team.</span>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 border-b" style={{ borderColor: 'rgba(5,34,16,0.08)' }}>
                {[
                    { id: 'trip', label: 'Trip Details' },
                    { id: 'notes', label: 'Trip Notes' },
                    { id: 'handover', label: 'Sales Handover Data' },
                    { id: 'checklist', label: 'Pre-Ops Checklist' }
                ].map(tab => {
                    const locked = tab.id === 'checklist' && !handoverAcknowledged
                    return (
                    <button
                        key={tab.id}
                        disabled={locked}
                        onClick={() => { if (!locked) setActiveTab(tab.id as any) }}
                        title={locked ? "Acknowledge the Sales Handover Data to unlock the Pre-Ops Checklist" : undefined}
                        className={`px-4 py-3 font-sans text-[11px] font-bold tracking-wider uppercase transition-all border-b-2 -mb-[px] ${activeTab === tab.id ? 'text-[#06a15c] border-[#06a15c]' : 'text-gray-400 border-transparent hover:text-gray-600'} ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                        {tab.label}
                    </button>
                    )
                })}
            </div>

            {/* Tab 1: Trip Details */}
            {activeTab === 'trip' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        {/* Customer info */}
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Customer</h3>
                            <div className="space-y-2 font-sans text-sm" style={{ color: 'rgba(5,34,16,0.8)' }}>
                                <p><strong style={{ color: '#052210' }}>{booking.customerName}</strong></p>
                                {booking.customerPhone && <p>{booking.customerPhone}</p>}
                                {booking.customerEmail && <p>{booking.customerEmail}</p>}
                            </div>
                        </div>

                        {/* Trip info */}
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Trip</h3>
                            <div className="space-y-2 font-sans text-sm" style={{ color: 'rgba(5,34,16,0.8)' }}>
                                <p>{booking.destination} · {booking.nights}N/{booking.days}D</p>
                                <p>{booking.startDate} → {booking.endDate}</p>
                                <p>{booking.adults} Adults{booking.children > 0 ? `, ${booking.children} Children (${booking.childAge})` : ""}</p>
                                {hotelCheckIn && <p><span className="text-gray-400 font-medium">Hotel Check-in:</span> {hotelCheckIn}</p>}
                                {hotelCheckOut && <p><span className="text-gray-400 font-medium">Hotel Check-out:</span> {hotelCheckOut}</p>}
                                {booking.placesCovered && <p>{booking.placesCovered}</p>}
                            </div>
                        </div>

                        {/* Sales Owner info */}
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', alignSelf: 'start' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Sales Owner</h3>
                            {booking.salesName || booking.consultantName ? (
                                <div className="space-y-2 font-sans text-sm" style={{ color: 'rgba(5,34,16,0.8)' }}>
                                    <p><strong style={{ color: '#052210' }}>{booking.salesName || booking.consultantName}</strong></p>
                                    <p><span className="text-gray-400 font-medium">Handover Date:</span> {booking.handoverDate || booking.updatedAt?.split('T')[0] || 'N/A'}</p>
                                    <p><span className="text-gray-400 font-medium">Handover Time:</span> {(() => {
                                        if (booking.handoverTime) return booking.handoverTime;
                                        if (booking.updatedAt) {
                                            try {
                                                return new Date(booking.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                            } catch (e) {}
                                        }
                                        return 'N/A';
                                    })()}</p>
                                </div>
                            ) : (
                                <div className="font-sans text-sm italic text-gray-400">
                                    Not handed over yet
                                </div>
                            )}
                        </div>

                        {/* Attached External Itinerary */}
                        {booking.externalItinerary && (
                            <div className="sm:col-span-2 rounded-2xl p-5 space-y-4" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                <h3 className="font-serif text-sm tracking-wider uppercase flex items-center gap-2" style={{ color: '#06a15c' }}>
                                    <Package className="w-4 h-4" /> Attached External Itinerary
                                </h3>
                                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/30">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 text-red-500 font-black font-sans text-[10px] uppercase shrink-0 border border-red-100">
                                            {booking.externalItinerary.type}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-sans text-sm font-bold text-[#052210] truncate">{booking.externalItinerary.name}</p>
                                            <p className="font-sans text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                {booking.externalItinerary.size ? `${(booking.externalItinerary.size / 1024 / 1024).toFixed(2)} MB · ` : ""}Attached Manual Itinerary
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => window.open(booking.externalItinerary.url, '_blank')}
                                            className="px-3 py-1.5 rounded-lg border border-gray-200 font-sans text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-all shadow-sm"
                                        >
                                            View/Open
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Hotels */}
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Hotels</h3>
                            <div className="space-y-4">
                                {(() => {
                                    const allPlans = booking?.plans || pricing?.[0]?.plans || []
                                    const activePlan = booking?.selectedPlanId 
                                        ? allPlans.find((p: any) => p.planId === booking.selectedPlanId || p.category === booking.selectedPlanId)
                                        : allPlans[0]
                                    const activeCategory = activePlan?.category || null
                                    
                                    const filteredHotels = activeCategory 
                                        ? hotels.filter((h: any) => h.category === activeCategory)
                                        : hotels
                                                                      return filteredHotels.map((h: any, idx: number) => {
                                        const planLabel = h.category || "Standard";
                                        const roomLabel = h.roomCategory || h.roomType || h.room || "Room";
                                        const mealLabel = h.mealPlan || "EP";
                                        const nights = h.nights || 1;

                                        return (
                                            <div key={`${h.id}-${idx}`} className="flex justify-between items-start pb-4 last:pb-0 last:border-0" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                                <div className="space-y-2">
                                                    <p className="font-sans text-sm font-bold" style={{ color: '#052210' }}>{h.name || h.hotelName || "Unnamed Hotel"}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[rgba(5,34,16,0.08)] bg-[rgba(5,34,16,0.03)] text-[11px]">
                                                            <span className="text-[rgba(5,34,16,0.4)]">Plan:</span>
                                                            <span className="text-[rgba(5,34,16,0.7)] font-medium">{planLabel}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[rgba(5,34,16,0.08)] bg-[rgba(5,34,16,0.03)] text-[11px]">
                                                            <span className="text-[rgba(5,34,16,0.4)]">Room:</span>
                                                            <span className="text-[rgba(5,34,16,0.7)] font-medium">{roomLabel}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[rgba(5,34,16,0.08)] bg-[rgba(5,34,16,0.03)] text-[11px]">
                                                            <span className="text-[rgba(5,34,16,0.4)]">Meal:</span>
                                                            <span className="text-[rgba(5,34,16,0.7)] font-medium">{mealLabel}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end shrink-0 pt-1">
                                                    <span className="font-sans text-[10px] text-gray-400 font-medium italic">{nights} night{nights !== 1 ? 's' : ''}</span>
                                                    {h.rating && <span className="font-sans text-[10px] text-amber-500 font-bold mt-0.5">{h.rating}★</span>}
                                                </div>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                        </div>

                        {/* Flights */}
                        {flights.length > 0 && (
                            <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Flights ({flights.length})</h3>
                                {flights.map((f: any, idx: number) => (
                                    <div key={`${f.id}-${idx}`} className="flex justify-between py-2" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                        <div>
                                            <span className="font-sans text-sm block" style={{ color: '#052210' }}>{f.airline} {f.flightNo ? `(${f.flightNo})` : ""}</span>
                                            <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.5)' }}>{f.fromCode} → {f.toCode} · {f.departure} - {f.arrival}</span>
                                        </div>
                                        <span className="font-sans text-xs font-bold self-start mt-1" style={{ color: '#06a15c' }}>{f.flightType}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Activities */}
                    {activities.length > 0 && (
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Activities ({activities.length})</h3>
                            {activities.map((a: any, idx: number) => (
                                <div key={`${a.id}-${idx}`} className="flex justify-between py-2" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                    <span className="font-sans text-sm" style={{ color: '#052210' }}>{a.name || a.activityName}</span>
                                    <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}>{a.category || a.activityType}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Transfers */}
                    {transfers.length > 0 && (
                        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Transfers ({transfers.length})</h3>
                            {transfers.map((t: any, idx: number) => (
                                <div key={idx} className="flex justify-between py-2 items-start" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                    <div>
                                        <span className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{t.type}{t.vehicleType ? ` · ${t.vehicleType}` : ''}</span>
                                        <div className="flex flex-col mt-1 space-y-0.5">
                                            {t.pickup && <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}><strong className="font-medium">Pickup:</strong> {t.pickup}</span>}
                                            {t.drop && <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}><strong className="font-medium">Drop:</strong> {t.drop}</span>}
                                        </div>
                                    </div>
                                    {t.price > 0 && (
                                        <span className="font-sans text-xs font-bold self-start mt-1" style={{ color: '#06a15c' }}>₹{Number(t.price).toLocaleString()}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pricing */}
                    {(() => {
                        const allPlans = booking.plans || pricing?.[0]?.plans || []
                        const activePlan = booking.selectedPlanId 
                            ? allPlans.find((p: any) => p.planId === booking.selectedPlanId || p.category === booking.selectedPlanId)
                            : allPlans[0]
                        
                        // If we have an active plan, show only that. Otherwise show all (fallback)
                        const displayPlans = activePlan ? [activePlan] : allPlans
                        
                        if (displayPlans.length === 0) return null

                        return (
                            <div className="rounded-2xl p-5" style={{ background: 'rgba(6,161,92,0.05)', border: '1px solid rgba(6,161,92,0.15)' }}>
                                <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Pricing</h3>
                                <div className="space-y-3">
                                    {displayPlans.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between items-end border-b pb-2 last:border-0 last:pb-0" style={{ borderColor: 'rgba(6,161,92,0.1)' }}>
                                            <div>
                                                <p className="font-sans text-xs font-bold" style={{ color: '#052210' }}>{p.planName || p.hotelName || "Option"}</p>
                                                <p className="font-sans text-[10px]" style={{ color: 'rgba(5,34,16,0.5)' }}>{p.category || "Standard"} | ₹{(p.perPersonPrice || 0).toLocaleString()} pp</p>
                                            </div>
                                            <p className="font-serif text-lg font-bold" style={{ color: '#06a15c' }}>₹{(p.totalPrice ?? p.overrideTotal ?? p.total ?? 0).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })()}

                    {/* Day Plans */}
                    {days.length > 0 && (
                        <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(6,161,92,0.08)' }}>
                                <h3 className="font-serif text-lg tracking-wide" style={{ color: '#06a15c' }}>Day Plans ({days.length})</h3>
                            </div>
                            {[...days].sort((a, b) => {
                                const numA = parseInt((a.day || String(a.dayNumber || '')).replace(/\D/g, '')) || 0
                                const numB = parseInt((b.day || String(b.dayNumber || '')).replace(/\D/g, '')) || 0
                                return numA - numB
                            }).map((day: any, idx: number) => (
                                <div key={day.id || idx} className="px-6 py-4" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="px-2.5 py-0.5 rounded-full font-sans text-[10px] font-bold tracking-wider uppercase" style={{ background: 'rgba(6,161,92,0.12)', color: '#06a15c' }}>{day.day}</span>
                                    </div>
                                    <p className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{day.title}</p>
                                    {day.description && <p className="font-sans text-xs mt-1" style={{ color: 'rgba(5,34,16,0.7)' }}>{day.description}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Sales Handover Data */}
            {activeTab === 'handover' && (
                <div className="space-y-6">
                    {salesChecklist.length > 0 ? (
                        <>
                            {groupedHandover.map((group) => (
                            <div key={group.key} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                <div className="px-6 py-3 border-b" style={{ background: 'rgba(6,161,92,0.05)', borderColor: 'rgba(5,34,16,0.06)' }}>
                                    <h4 className="font-sans text-xs font-bold uppercase tracking-wider" style={{ color: '#06a15c' }}>{group.title}</h4>
                                </div>
                                {group.items.map((item: any, idx: number) => {
                                    const type = (item.type || "").toLowerCase();
                                    const hasResponse = !!item.response && item.response.toString().trim() !== "";
                                    const hasFile = !!item.fileUrl;
                                    const hasAck = !!item.acknowledged || !!item.checked;

                                    return (
                                        <div key={idx} className="px-6 py-4 border-b last:border-0" style={{ borderColor: 'rgba(5,34,16,0.05)' }}>
                                            <p className="font-sans text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(5,34,16,0.6)' }}>{item.name || item.title}</p>
                                            
                                            <div className="space-y-3 mt-1">
                                                {/* File Attachment — inline thumbnail preview (image) or file chip */}
                                                {hasFile && (
                                                    <div className="flex flex-wrap gap-3">
                                                        {item.fileUrl.split(',').filter(Boolean).map((url: string, i: number) => (
                                                            <FilePreview key={i} url={url} size={72} />
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* Choice with Options */}
                                                {(type.includes("choice") && (item.options || item.points)) && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {(item.options || item.points || []).map((opt: any, i: number) => {
                                                            const isSelected = Array.isArray(item.response) ? item.response.includes(opt) : item.response === opt;
                                                            return (
                                                                <span key={i} className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{ background: isSelected ? '#06a15c' : 'rgba(5,34,16,0.08)', color: isSelected ? '#FFFFFF' : 'rgba(5,34,16,0.4)' }}>
                                                                    {opt}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Text Response */}
                                                {(hasResponse && !type.includes("choice")) && (
                                                    <div className="font-sans" style={{ background: 'rgba(5,34,16,0.03)', border: '0.5px solid rgba(5,34,16,0.1)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: '#052210' }}>
                                                        {item.response}
                                                    </div>
                                                )}

                                                {/* Checkbox/Acknowledgement */}
                                                {(hasAck || type.includes("checkbox") || item.requiresAcknowledgement) && !hasResponse && (
                                                    <div className="flex items-center gap-2 text-[#06a15c]">
                                                        <CheckCircle className="w-4 h-4" />
                                                        <span className="font-sans text-xs font-semibold">Confirmed</span>
                                                    </div>
                                                )}

                                                {(!hasFile && !hasResponse && !hasAck && !type.includes("choice")) && (
                                                    <div className="font-sans italic" style={{ background: 'rgba(5,34,16,0.03)', border: '0.5px solid rgba(5,34,16,0.1)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'rgba(5,34,16,0.4)' }}>
                                                        N/A
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            ))}
                        </>
                    ) : (
                        <div className="py-12 text-center rounded-2xl bg-white border border-dashed border-gray-200">
                            <p className="font-sans text-sm text-gray-400 italic">No handover checklist data found for this booking.</p>
                        </div>
                    )}

                    {/* Acknowledgement — must be clicked to unlock the Pre-Ops Checklist */}
                    <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                        <div>
                            <p className="font-sans text-sm font-bold" style={{ color: '#052210' }}>Acknowledge Sales Handover</p>
                            <p className="font-sans text-xs text-gray-400 mt-0.5">Confirm you have reviewed all handover data. This unlocks the Pre-Ops Checklist.</p>
                        </div>
                        {handoverAcknowledged ? (
                            <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
                                <CheckCircle className="w-4 h-4" /> Acknowledged
                            </span>
                        ) : (
                            <button
                                onClick={handleAcknowledgeHandover}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-sans text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
                                style={{ background: '#06a15c', color: '#FFFFFF' }}
                            >
                                <CheckCircle className="w-4 h-4" /> Acknowledge &amp; Enable Checklist
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Tab 4: Trip Notes */}
            {activeTab === 'notes' && (
                <div className="max-w-3xl mx-auto space-y-4">
                    <UpsellHistory booking={booking} />
                    <TripNotes itineraryId={bookingId} />
                </div>
            )}

            {/* Tab 3: Pre-Ops Checklist */}
            {activeTab === 'checklist' && (
                <div className="space-y-6">
                    <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-sans text-xs tracking-wider uppercase" style={{ color: 'rgba(6,161,92,0.6)' }}>Checklist Progress</span>
                            <span className="font-sans text-sm font-bold" style={{ color: progress === 100 ? '#34d399' : '#06a15c' }}>{progress}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(5,34,16,0.08)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : 'linear-gradient(90deg, #06a15c, #34d399)' }} />
                        </div>
                        <p className="font-sans text-xs mt-2" style={{ color: 'rgba(5,34,16,0.5)' }}>{completedCount} of {requiredChecklist.length} mandatory tasks completed</p>
                    </div>

                    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(6,161,92,0.08)' }}>
                            <h3 className="font-serif text-lg tracking-wide" style={{ color: '#06a15c' }}>Operations SOP Checklist</h3>
                            <div className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="font-sans text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{completedCount} / {requiredChecklist.length} Mandatory Done</span>
                            </div>
                        </div>
                        {checklist.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <Package className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(6,161,92,0.2)' }} />
                                <p className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>SOP Checklist not initialized</p>
                            </div>
                        ) : (
                            checklist.map((item: any) => {
                                const isMandatory = item.isRequired !== false;
                                const type = (item.type || "").toUpperCase();
                                
                                const hasText = !!item.response && item.response.toString().trim().length > 0;
                                const hasFile = !!item.fileUrl;
                                const hasAck = !!item.acknowledged;
                                
                                // Validation for activation
                                let isAnswered = false;
                                if (type === "MULTIPLE CHOICE" || type === "MULTIPLE_CHOICE") {
                                    isAnswered = !!item.response;
                                } else if (type === "FILE UPLOAD" || type === "FILE_UPLOAD") {
                                    isAnswered = hasFile;
                                } else if (item.requiresAcknowledgement || type === "CHECKBOX CHECK" || type === "CHECKBOX_CHECK") {
                                    isAnswered = hasAck;
                                } else if (type === "TEXT INPUT" || type === "TEXT_INPUT" || type === "NUMBER INPUT" || type === "NUMBER_INPUT" || type === "DATE PICKER" || type === "DATE_PICKER") {
                                    isAnswered = hasText;
                                } else {
                                    isAnswered = true;
                                }

                                // Dependency lock: if this item depends on another, it stays disabled
                                // until that dependency item is checked.
                                const depItem = item.dependsOn
                                    ? checklist.find((c: any) => (c.originalId && c.originalId === item.dependsOn) || c.id === item.dependsOn)
                                    : null;
                                const isLocked = !!depItem && !depItem.checked && !item.checked;

                                const isHighlighted = highlightedItemId === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        ref={(el) => { itemRefs.current[item.id] = el }}
                                        className={`w-full px-6 py-5 flex items-start gap-4 border-b last:border-0 scroll-mt-24 transition-all duration-300 ${isHighlighted ? "bg-red-50/60 ring-2 ring-inset ring-red-300" : ""}`}
                                        style={{ borderColor: 'rgba(6,161,92,0.06)' }}
                                    >
                                        <button
                                            onClick={() => { if (!isLocked) toggleItem(item.id, item.checked) }}
                                            disabled={(!isAnswered && !item.checked) || isLocked}
                                            className={`mt-1 transition-all ${item.checked ? "scale-95" : (isAnswered && !isLocked) ? "hover:scale-110 cursor-pointer" : "opacity-30 cursor-not-allowed"}`}
                                        >
                                            {item.checked ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5 text-gray-300" />}
                                        </button>
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <span
                                                    onClick={() => { if (!isLocked && (isAnswered || item.checked)) toggleItem(item.id, item.checked) }}
                                                    className={`font-sans text-sm font-bold transition-all ${item.checked ? 'text-gray-300 line-through' : 'text-[#052210]'} ${(!isLocked && (isAnswered || item.checked)) ? 'cursor-pointer hover:text-[#06a15c]' : ''}`}
                                                >{item.name || item.title}</span>
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${isMandatory ? "bg-red-50 text-red-500 border border-red-100" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                                                    {isMandatory ? "Mandatory" : "Optional"}
                                                </span>
                                            </div>

                                            {isHighlighted && (
                                                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold animate-in fade-in slide-in-from-top-1 duration-300">
                                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                                    You missed this mandatory task — please complete it to continue.
                                                </div>
                                            )}

                                            {!item.checked && (
                                                isLocked ? (
                                                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-[11px] font-semibold">
                                                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                                        Complete &ldquo;{depItem?.name || depItem?.title}&rdquo; first to unlock this step.
                                                    </div>
                                                ) : (
                                                <div className="space-y-4 pt-1">
                                                    {/* Date Picker */}
                                                    {(type === "DATE PICKER" || type === "DATE_PICKER") && (
                                                        <div className="relative w-full sm:w-64 group/input cursor-pointer">
                                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                                                                <Calendar className="w-3.5 h-3.5 text-gray-400 group-focus-within/input:text-[#1D9E75] transition-colors" />
                                                            </div>
                                                            <input 
                                                                type="date" 
                                                                value={item.response || ""} 
                                                                onChange={(e) => updateSopItemState(item.id, { response: e.target.value })} 
                                                                onClick={(e) => {
                                                                    try {
                                                                        e.currentTarget.showPicker();
                                                                    } catch (err) {}
                                                                }}
                                                                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white font-sans text-sm text-[#0d3d2b] focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all cursor-pointer shadow-sm relative z-0"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Text/Number Input */}
                                                    {(type === "TEXT INPUT" || type === "TEXT_INPUT" || type === "NUMBER INPUT" || type === "NUMBER_INPUT") && (
                                                        <input 
                                                            type={type.includes("NUMBER") ? "number" : "text"}
                                                            value={item.response || ""} 
                                                            onChange={(e) => updateSopItemState(item.id, { response: e.target.value })} 
                                                            placeholder="Enter details..."
                                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-sm outline-none focus:border-emerald-500 transition-all"
                                                        />
                                                    )}

                                                    {/* File Upload */}
                                                    {(type === "FILE UPLOAD" || type === "FILE_UPLOAD") && (
                                                        <div className="w-full">
                                                            {(() => {
                                                                const urls = item.fileUrl ? item.fileUrl.split(',').filter(Boolean) : [];
                                                                return (
                                                                    <>
                                                                        {urls.length < 10 ? (
                                                                            <div className="flex items-center gap-3">
                                                                                <input
                                                                                    type="file"
                                                                                    id={`f-${item.id}`}
                                                                                    className="hidden"
                                                                                    multiple
                                                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                                                    onChange={(e) => handleFileUpload(item.id, e.target.files)}
                                                                                />
                                                                                <label htmlFor={`f-${item.id}`} className="cursor-pointer flex items-center gap-3 px-5 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group">
                                                                                    <UploadCloud className="w-5 h-5 text-gray-400 group-hover:text-emerald-500" />
                                                                                    <div className="text-left">
                                                                                        <p className="font-sans text-[11px] font-bold text-gray-700 uppercase tracking-wider">Click to upload files</p>
                                                                                        <p className="font-sans text-[9px] text-gray-400">PDF, JPG, PNG accepted · Up to 10 files</p>
                                                                                    </div>
                                                                                </label>
                                                                                {uploadingItemId === item.id && <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="font-sans text-[10px] text-amber-500 font-bold uppercase tracking-wider">⚠️ Maximum 10 files uploaded for this item</p>
                                                                        )}

                                                                        {urls.length > 0 && (
                                                                            <div className="flex flex-wrap gap-3 mt-3">
                                                                                {urls.map((url: string, index: number) => (
                                                                                    <FilePreview
                                                                                        key={index}
                                                                                        url={url}
                                                                                        size={72}
                                                                                        onDelete={() => {
                                                                                            const updatedUrls = urls.filter((_, i) => i !== index).join(',');
                                                                                            updateSopItemState(item.id, { fileUrl: updatedUrls });
                                                                                        }}
                                                                                    />
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}

                                                    {/* Multiple Choice */}
                                                    {(type === "MULTIPLE CHOICE" || type === "MULTIPLE_CHOICE") && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {(item.options || []).map((opt: string) => {
                                                                const isSelected = item.response === opt;
                                                                return (
                                                                    <button
                                                                        key={opt}
                                                                        onClick={() => updateSopItemState(item.id, { response: opt })}
                                                                        className={`px-4 py-1.5 rounded-full border font-sans text-xs font-semibold transition-all ${isSelected ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Checkbox Check (Acknowledgement) */}
                                                    {(item.requiresAcknowledgement || type === "CHECKBOX CHECK" || type === "CHECKBOX_CHECK") && (
                                                        <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-all group">
                                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${item.acknowledged ? "bg-emerald-500 border-emerald-500" : "border-gray-300 group-hover:border-emerald-500"}`}>
                                                                {item.acknowledged && <CheckCircle className="w-3 h-3 text-white" />}
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="hidden" 
                                                                    checked={item.acknowledged || false}
                                                                    onChange={(e) => updateSopItemState(item.id, { acknowledged: e.target.checked })}
                                                                />
                                                            </div>
                                                            <span className="font-sans text-[11px] font-bold text-gray-500 uppercase tracking-wider">Yes, I have completed this step</span>
                                                        </label>
                                                    )}

                                                    {/* Helper Notes */}
                                                    {item.notes && (
                                                        <div className="flex gap-2 text-[11px] text-gray-400 italic bg-gray-50/50 p-2 rounded-lg border border-gray-100/50">
                                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                            <span>{item.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {booking.status === "post-ops" || booking.status === "completed" ? (
                        <div className="w-full py-8 rounded-2xl bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in duration-500">
                             <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <CheckCircle className="w-6 h-6 text-white" />
                             </div>
                             <p className="font-serif text-lg text-emerald-800 tracking-wide mt-2">Handover Completed Successfully</p>
                             <p className="font-sans text-[11px] text-emerald-600 uppercase font-bold tracking-[0.2em]">Ready for Post-Operations Processing</p>
                        </div>
                    ) : (() => {
                        const pendingCount = requiredChecklist.filter(c => !c.checked).length
                        const hasPending = requiredChecklist.length > 0 && pendingCount > 0
                        if (hasPending) {
                            return (
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={showFirstPending}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-sans font-bold text-sm tracking-widest uppercase transition-all bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 active:scale-[0.98]"
                                    >
                                        Show Pending Field <ArrowLeft className="w-4 h-4 rotate-180" />
                                    </button>
                                    <p className="font-sans text-[11px] text-amber-600 text-center flex items-center justify-center gap-1.5">
                                        <AlertCircle className="w-3 h-3" />
                                        {pendingCount} mandatory task(s) remaining — tap above to jump to the next one.
                                    </p>
                                </div>
                            )
                        }
                        return (
                            <button
                                onClick={handleHandover}
                                disabled={loading}
                                className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-sans font-bold text-sm tracking-widest uppercase transition-all ${loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#06a15c] text-white hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-emerald-900/10'}`}
                            >
                                Handover to Post-Operation <ArrowLeft className="w-4 h-4 rotate-180" />
                            </button>
                        )
                    })()}
                </div>
            )}
        </div>
    )
}
