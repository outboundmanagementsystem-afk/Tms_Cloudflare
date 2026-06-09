"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
    getItinerary, getItineraryDays, getItineraryHotels, getItineraryTransfers,
    getItineraryPricing, updateItineraryStatus, initSopChecklist, getItineraryFlights, getItineraryActivities,
    getSalesChecklist, updateSalesItem, initSalesChecklist, syncChecklist, addPayment, updateItinerary,
    getSopChecklist, getPostOpsChecklist, updateSopItem, updatePostOpsItem, initPostOpsChecklist,
    getAccessTokensForItinerary, createAccessTokenRequest
} from "@/lib/firestore"

import { useAuth } from "@/lib/auth-context"
import { useDialog } from "@/components/dialog-provider"
import type { ItineraryStatus } from "@/lib/firestore"
import type { PaymentFormData } from "@/components/payment-collection-modal"
import PaymentCollectionModal from "@/components/payment-collection-modal"
import SalesChecklistModal from "@/components/sales-checklist-modal"
import { UpsellDownsellControl, UpsellHistory } from "@/components/upsell-downsell"
import Link from "next/link"
import TripNotes from "@/components/trip-notes"
import { ArrowLeft, Clock, Send, FileEdit, CheckCircle, XCircle, ChevronRight, Share2, Eye, Download, FileText, Hotel, Car, DollarSign, MapPin, Calendar, Users, Map, Circle, UploadCloud, AlertCircle, X, Lock, Key } from "lucide-react"

const statusFlow: ItineraryStatus[] = ["draft", "sent", "handover", "pre-ops", "post-ops", "completed"]
const statusColors: Record<string, string> = {
    draft: "#9ca3af",
    sent: "#3182CE",
    handover: "#1D9E75",
    "pre-ops": "#f59e0b",
    "post-ops": "#3b82f6",
    completed: "#10b981",
}

export default function ItineraryDetailPage() {
    return (
        <ProtectedRoute allowedRoles={["sales", "sales_lead", "ops", "ops_lead", "admin", "owner"] as any}>
            <ItineraryDetail />
        </ProtectedRoute>
    )
}

function ItineraryDetail() {
    const params = useParams()
    const router = useRouter()
    const itinId = params.id as string
    const { userProfile } = useAuth()
    const { showDialog } = useDialog()
    const [itin, setItin] = useState<any>(null)
    const [days, setDays] = useState<any[]>([])
    const [hotels, setHotels] = useState<any[]>([])
    const [transfers, setTransfers] = useState<any[]>([])
    const [pricing, setPricing] = useState<any[]>([])
    const [flights, setFlights] = useState<any[]>([])
    const [activities, setActivities] = useState<any[]>([])
    const [salesChecklist, setSalesChecklist] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [showChecklistModal, setShowChecklistModal] = useState(false)
    const [pendingStatus, setPendingStatus] = useState<ItineraryStatus | null>(null)
    const [hasTokenAccess, setHasTokenAccess] = useState(false)
    const [myToken, setMyToken] = useState<any>(null)
    const [tokenNonce, setTokenNonce] = useState(0)
    const [showTokenModal, setShowTokenModal] = useState(false)
    const [tokenReason, setTokenReason] = useState("")
    const [tokenSubmitting, setTokenSubmitting] = useState(false)
    const [showConfirmOps, setShowConfirmOps] = useState(false)
    const [stagingOps, setStagingOps] = useState(false)
    const [preOpsChecklist, setPreOpsChecklist] = useState<any[]>([])
    const [postOpsChecklist, setPostOpsChecklist] = useState<any[]>([])
    const [loadingChecklists, setLoadingChecklists] = useState(false)
    const [uploadingChecklistItemId, setUploadingChecklistItemId] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState("trip-details")
    const [showSentConfirm, setShowSentConfirm] = useState(false)

    useEffect(() => { loadAll() }, [itinId])

    // Watch this sales user's edit-access token: enable editing on approval and show a
    // one-time dialog when Pre-Ops approves or rejects the request. Polls while a request
    // is still pending so the notification appears live, and also fires on a fresh load.
    useEffect(() => {
        if (!itin || !userProfile) return
        const lockedStatuses = ["handover", "pre-ops", "post-ops"]
        const salesRoles = ["sales", "sales_lead"]
        if (!lockedStatuses.includes(itin.status) || !salesRoles.includes(userProfile.role)) return

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        const check = async () => {
            try {
                const tokens = await getAccessTokensForItinerary(itinId)
                if (cancelled) return
                const nowIso = new Date().toISOString()
                const latest = tokens
                    .filter((t: any) => t.requestedBy === userProfile.uid)
                    .sort((a: any, b: any) => (b.requestedAt > a.requestedAt ? 1 : -1))[0]
                setMyToken(latest || null)

                if (latest?.status === "approved" && (!latest.expiresAt || latest.expiresAt > nowIso)) {
                    setHasTokenAccess(true)
                }

                // One-time decision notification (keyed by token id + status so it shows
                // exactly once, even across page reloads).
                if (latest && (latest.status === "approved" || latest.status === "rejected")) {
                    const ackKey = `tokenAck:${latest.id}:${latest.status}`
                    if (typeof window !== "undefined" && !localStorage.getItem(ackKey)) {
                        localStorage.setItem(ackKey, "1")
                        if (latest.status === "approved") {
                            showDialog({
                                title: "Edit Access Approved",
                                message: `Your edit-access request was approved${latest.approvedByName ? ` by ${latest.approvedByName}` : ""}. You can now make changes to this booking.`,
                                type: "success",
                            })
                        } else {
                            showDialog({
                                title: "Edit Access Rejected",
                                message: `Your edit-access request was rejected${latest.approvedByName ? ` by ${latest.approvedByName}` : ""}. Please contact the Pre-Ops team if you still need to make changes.`,
                                type: "error",
                            })
                        }
                    }
                }

                // Keep polling only while a decision is still pending.
                if (!cancelled && latest?.status === "pending") {
                    timer = setTimeout(check, 15000)
                }
            } catch { /* transient error — will retry on next load/interaction */ }
        }

        check()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [itin, userProfile, itinId, tokenNonce])

    const handleRaiseToken = async () => {
        if (!tokenReason.trim() || tokenSubmitting || !userProfile) return
        setTokenSubmitting(true)
        try {
            await createAccessTokenRequest(
                itinId,
                userProfile.uid,
                userProfile.name || userProfile.email || "",
                userProfile.role,
                tokenReason.trim()
            )
            setTokenReason("")
            setShowTokenModal(false)
            showDialog({ title: "Request Sent", message: "Your edit access request has been sent for approval. You'll be able to edit once it's approved.", type: "success" })
            // Refresh token state
            const tokens = await getAccessTokensForItinerary(itinId)
            const latest = tokens
                .filter(t => t.requestedBy === userProfile.uid)
                .sort((a: any, b: any) => (b.requestedAt > a.requestedAt ? 1 : -1))[0]
            setMyToken(latest || null)
            setTokenNonce(n => n + 1) // restart the approval/rejection watcher for the new request
        } catch (err: any) {
            console.error("Token request error:", err)
            const msg = err?.message || "Failed to send request. Please try again."
            showDialog({ title: "Error", message: msg, type: "error" })
        } finally {
            setTokenSubmitting(false)
        }
    }

    const loadAll = async () => {
        try {
            const [itDoc, d, h, t, p, f, a] = await Promise.all([
                getItinerary(itinId),
                getItineraryDays(itinId),
                getItineraryHotels(itinId),
                getItineraryTransfers(itinId),
                getItineraryPricing(itinId),
                getItineraryFlights(itinId),
                getItineraryActivities(itinId),
            ])
            if (!itDoc) {
                setLoading(false)
                return
            }
            const it = itDoc as any
            // Ownership check for Sales role
            const isAdminRole = userProfile?.role === "admin" || userProfile?.role === "owner"
            const isOpsRole = (userProfile?.role as string) === "ops" || (userProfile?.role as string) === "ops_lead" || userProfile?.role === "pre_ops" || userProfile?.role === "post_ops"
            
            if (it && userProfile && !isAdminRole && !isOpsRole && it.createdBy !== userProfile.uid) {
                console.warn("Access denied: Not the creator of this itinerary")
                setItin(null)
                setLoading(false)
                return
            }

            setItin(it)
            setDays(d)
            setHotels(h)
            setTransfers(t)
            setPricing(p)
            setFlights(f)
            setActivities(a)

            await syncChecklist(itinId, "sales", "salesChecklist");
            const cl = await getSalesChecklist(itinId);
            
            // Client-side deduplication to prevent React 18 strict mode double-mount artifacts from displaying
            const uniqueCl = [];
            const seen = new Set();
            for (const item of cl) {
                const key = item.originalId || item.name;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueCl.push(item);
                }
            }
            setSalesChecklist(uniqueCl);

            if (isAdminRole) {
                setLoadingChecklists(true)
                try {
                    const [preCl, postCl] = await Promise.all([
                        getSopChecklist(itinId),
                        getPostOpsChecklist(itinId)
                    ])
                    setPreOpsChecklist(preCl)
                    setPostOpsChecklist(postCl)
                    
                    // Set default tab based on status
                    if (it.status === 'pre-ops' || it.status === 'handover') setActiveTab('pre-ops-checklist')
                    else if (it.status === 'post-ops') setActiveTab('post-ops-checklist')
                } catch (e) {
                    console.error("Error loading checklists", e)
                } finally {
                    setLoadingChecklists(false)
                }
            }
        } catch (err) { console.error(err) }
        finally { setLoading(false) }
    }

    const checkIfItemAnswered = (item: any) => {
        const type = (item.type || "").toLowerCase()
        const hasText = !!item.response && item.response.toString().trim().length > 0
        const hasFile = !!item.fileUrl && item.fileUrl.toString().trim().length > 0
        const hasAck = !!item.acknowledged

        if (type === "multiple_choice") return !!item.response

        const supportsFile = ["file_upload", "file"].some(t => type.includes(t))
        const supportsText = ["text", "number"].some(t => type.includes(t)) && !type.includes("date")

        if (supportsFile && supportsText) return hasFile || hasText
        if (supportsFile) return hasFile

        if (item.requiresAcknowledgement || ["checkbox_check", "checkbox"].includes(type)) return hasAck

        // Default for text, number, date
        return hasText
    }

    const toggleSalesItem = async (itemId: string, currentChecked: boolean) => {
        await updateSalesItem(itinId, itemId, {
            checked: !currentChecked,
            updatedAt: new Date().toISOString(),
        })
        setSalesChecklist(salesChecklist.map(c => c.id === itemId ? { ...c, checked: !currentChecked } : c))
    }

    const updateSalesItemState = async (itemId: string, data: any) => {
        const item = salesChecklist.find(c => c.id === itemId)
        if (!item) return

        const mergedItem = { ...item, ...data }
        const checked = checkIfItemAnswered(mergedItem)

        const updateData = { ...data, checked, updatedAt: new Date().toISOString() }

        await updateSalesItem(itinId, itemId, updateData)
        setSalesChecklist(prev => prev.map(c => c.id === itemId ? { ...c, ...updateData } : c))
    }

    const handleFileUpload = async (itemId: string, files: File[]) => {
        if (!files || files.length === 0) return
        setUploadingItemId(itemId)
        try {
            const workerUrl = "https://outbound-storage.outboundmanagementsystem.workers.dev"
            const uploadedUrls: string[] = []
            
            for (const file of files) {
                const url = `${workerUrl.replace(/\/$/, '')}/sops/${itinId}/${itemId}/${encodeURIComponent(file.name)}`
                const response = await fetch(url, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type || "application/octet-stream" }
                })
                if (!response.ok) throw new Error(`R2 Worker upload failed for ${file.name}`)
                uploadedUrls.push(url)
            }
            
            setSalesChecklist(prev => {
                const currentItem = prev.find(c => c.id === itemId)
                const currentUrls = currentItem?.fileUrl ? currentItem.fileUrl.split(',').filter(Boolean) : []
                const newUrls = [...currentUrls, ...uploadedUrls].slice(0, 10)
                
                // Update checklist item in D1
                const mergedItem = { ...currentItem, fileUrl: newUrls.join(',') }
                const checked = checkIfItemAnswered(mergedItem)
                const updateData = { fileUrl: newUrls.join(','), checked, updatedAt: new Date().toISOString() }

                updateSalesItem(itinId, itemId, updateData).catch(err => {
                    console.error("D1 sync failed", err)
                })
                
                return prev.map(c => c.id === itemId ? { ...c, ...updateData } : c)
            })
        } catch (error) {
            console.error("Upload failed", error)
            showDialog({
                title: "Error",
                message: "File upload failed.",
                type: "error"
            })
        } finally {
            setUploadingItemId(null)
        }
    }

    const toggleChecklistItem = async (checklistType: 'pre' | 'post', itemId: string, currentChecked: boolean) => {
        const checklist = checklistType === 'pre' ? preOpsChecklist : postOpsChecklist
        const item = checklist.find(c => c.id === itemId)
        if (!item) return

        // Validation: If checking (unmarked -> marked) and mandatory input is missing
        if (!currentChecked && item.isRequired !== false) {
            const type = (item.type || "").toUpperCase()
            const needsText = ['TEXT_INPUT', 'TEXT', 'DATE_PICKER', 'NUMBER_INPUT'].includes(type) && !item.response
            const needsFile = ['FILE_UPLOAD', 'FILE'].includes(type) && !item.fileUrl
            const needsAck = (item.requiresAcknowledgement || type === 'CHECKBOX_CHECK') && !item.acknowledged
            
            if (needsText || needsFile || needsAck) {
                showDialog({
                    title: "Warning",
                    message: "Please complete the required information before marking this mandatory task as complete.",
                    type: "warning"
                })
                return
            }
        }

        try {
            const updateFn = checklistType === 'pre' ? updateSopItem : updatePostOpsItem
            await updateFn(itinId, itemId, {
                checked: !currentChecked,
                updatedAt: new Date().toISOString(),
            })
            
            if (checklistType === 'pre') {
                setPreOpsChecklist(preOpsChecklist.map(c => c.id === itemId ? { ...c, checked: !currentChecked } : c))
            } else {
                setPostOpsChecklist(postOpsChecklist.map(c => c.id === itemId ? { ...c, checked: !currentChecked } : c))
            }
        } catch (err) {
            console.error("Toggle Item Failed:", err)
            showDialog({
                title: "Error",
                message: "Failed to update item.",
                type: "error"
            })
        }
    }

    const updateChecklistItemState = async (checklistType: 'pre' | 'post', itemId: string, data: any) => {
        const updateFn = checklistType === 'pre' ? updateSopItem : updatePostOpsItem
        await updateFn(itinId, itemId, data)
        if (checklistType === 'pre') {
            setPreOpsChecklist(preOpsChecklist.map(c => c.id === itemId ? { ...c, ...data } : c))
        } else {
            setPostOpsChecklist(postOpsChecklist.map(c => c.id === itemId ? { ...c, ...data } : c))
        }
    }

    const handleChecklistFileUpload = async (checklistType: 'pre' | 'post', itemId: string, file: File | undefined) => {
        if (!file) return
        setUploadingChecklistItemId(itemId)
        try {
            const workerUrl = "https://outbound-storage.outboundmanagementsystem.workers.dev"
            const url = `${workerUrl.replace(/\/$/, '')}/sops/${itinId}/${itemId}/${encodeURIComponent(file.name)}`
            
            const response = await fetch(url, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": file.type || "application/octet-stream" }
            })
            if (!response.ok) throw new Error("Upload failed")
            // Auto-mark the item complete once a file is attached (matches the Ops workspace).
            const list = checklistType === 'pre' ? preOpsChecklist : postOpsChecklist
            const cur = list.find(c => c.id === itemId)
            const checked = checkIfItemAnswered({ ...cur, fileUrl: url })
            await updateChecklistItemState(checklistType, itemId, { fileUrl: url, checked })
        } catch (error) {
            console.error(error)
            showDialog({
                title: "Error",
                message: "File upload failed.",
                type: "error"
            })
        } finally {
            setUploadingChecklistItemId(null)
        }
    }

    const handleStatusChange = async (newStatus: ItineraryStatus) => {
        // When moving to "handover", show checklist modal first
        if (newStatus === "handover") {
            setPendingStatus("handover")
            setShowChecklistModal(true)
            return
        }
        await _doStatusChange(newStatus)
    }

    const handleSubmitToOps = async () => {
        setStagingOps(true)
        try {
            await _doStatusChange("pre-ops")
        } finally {
            setStagingOps(false)
            setShowConfirmOps(false)
        }
    }

    const _doStatusChange = async (newStatus: ItineraryStatus) => {
        const extraData: any = {}
        if (newStatus === "handover") {
            extraData.salesName = userProfile?.name || "Sales Person"
            extraData.handoverDate = new Date().toISOString().split('T')[0]
            extraData.assignedBySalesId = userProfile?.uid || ""
            extraData.assignedBySalesName = userProfile?.name || ""
        }
        try {
            await updateItineraryStatus(itinId, newStatus, extraData)
            if (newStatus === "handover") {
                await initSopChecklist(itinId)
            }
            // Optimistically reflect the new status immediately, then refresh from server.
            setItin((prev: any) => prev ? { ...prev, status: newStatus } : prev)
            await loadAll()
        } catch (err: any) {
            console.error(err)
            showDialog({
                title: "No Pre-Ops Available",
                message: err.message || "No available Pre-Ops employee found. Please update team availability or assign manually.",
                type: "warning"
            })
        }
    }

    const handlePaymentSubmit = async (data: PaymentFormData) => {
        let screenshotUrl: string | undefined
        const screenshotUrls: string[] = []

        // Upload screenshot(s) via Cloudflare R2 worker if provided
        if (data.screenshotFiles && data.screenshotFiles.length > 0) {
            const workerUrl = "https://outbound-storage.outboundmanagementsystem.workers.dev"
            for (const file of data.screenshotFiles) {
                const url = `${workerUrl}/payments/${itinId}/${Date.now()}_${encodeURIComponent(file.name)}`
                const res = await fetch(url, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type || "application/octet-stream" },
                })
                if (res.ok) {
                    screenshotUrls.push(url)
                }
            }
            if (screenshotUrls.length > 0) {
                screenshotUrl = screenshotUrls[0]
            }
        }

        await addPayment(itinId, {
            type: data.type,
            amount: data.amount,
            method: data.method,
            notes: data.notes,
            screenshotUrl,
            screenshotUrls,
            collectedBy: userProfile?.uid || "",
            collectedByName: userProfile?.name || "",
            collectedAt: new Date().toISOString(),
        } as any)

        // UPDATE ITINERARY WITH SELECTED PLAN IF PROVIDED
        if (data.selectedPlan) {
            const planToSave = (data.selectedPlan as any).planId || data.selectedPlan.category
            if (planToSave) {
                await updateItinerary(itinId, { selectedPlanId: planToSave })
            }
        }

        setShowPaymentModal(false)
        // Now proceed with the status change
        if (pendingStatus) {
            await _doStatusChange(pendingStatus)
            setPendingStatus(null)
        }
    }

    const handleMarkAsSent = async () => {
        try {
            await updateItinerary(itinId, {
                status: 'sent',
                sentAt: new Date().toISOString(),
                sentBy: userProfile?.uid,
                sentByName: userProfile?.name
            })
            await loadAll()
            setShowSentConfirm(false)
        } catch (err) { console.error(err) }
    }

    const currentStatusIdx = statusFlow.indexOf(itin?.status || "draft")
    const nextStatus = currentStatusIdx < statusFlow.length - 1 ? statusFlow[currentStatusIdx + 1] : null
    const role = userProfile?.role || ""
    const isAdmin = role === "admin" || role === "owner"
    const isSales = role === "sales" || role === "sales_lead"
    const isOps = (role as string) === "ops" || (role as string) === "ops_lead"
    const currentStatus = itin?.status || "draft"

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
        </div>
    )

    if (!itin) return (
        <div className="text-center py-20">
            <p className="font-sans text-sm" style={{ color: 'rgba(5,34,16,0.5)' }}>Itinerary not found</p>
        </div>
    )

    const requiredChecklist = salesChecklist.filter(c => c.isRequired !== false)

    const handleShare = () => {
        const consultantName = userProfile?.name || "our travel consultant"
        const destination = itin?.destination || "your destination"
        const nights = itin?.nights || ""
        const days = itin?.days || ""
        const duration = nights && days ? `${nights}N/${days}D` : ""
        
        const message = `Hello ${itin?.customerName || "Sir/Madam"},

Greetings from Outbound Travelers!

This is ${consultantName}, and I would be happy to assist you in planning your trip to ${destination}${duration ? ` (${duration})` : ""} and ensuring a smooth travel experience.

I have shared your detailed itinerary with you in the attached PDF. Kindly go through it at your convenience.

If you have any questions, would like to make customizations, or have any concerns regarding the package, please feel free to reach out to me. I am here to assist you in any way I can.`

        const encodedMessage = encodeURIComponent(message)
        
        let whatsappUrl = ""
        if (itin?.customerPhone) {
            const phone = itin.customerPhone.replace(/[^0-9]/g, '')
            const phoneWithCode = (phone.length === 10) ? `91${phone}` : phone
            whatsappUrl = `https://wa.me/${phoneWithCode}?text=${encodedMessage}`
        } else {
            whatsappUrl = `https://wa.me/?text=${encodedMessage}`
        }

        window.open(whatsappUrl, '_blank')
    }

    return (
        <>
        {showChecklistModal ? (
            <SalesChecklistModal
                isOpen={showChecklistModal}
                onClose={() => setShowChecklistModal(false)}
                checklist={salesChecklist}
                onToggleItem={toggleSalesItem}
                onUpdateItem={updateSalesItemState}
                onFileUpload={handleFileUpload}
                uploadingItemId={uploadingItemId}
                tripStartDate={itin?.startDate}
                tripEndDate={itin?.endDate}
                onComplete={() => {
                    setShowChecklistModal(false)
                    setShowPaymentModal(true)
                }}
            />
        ) : (
            <div className="space-y-6 max-w-5xl mx-auto">
                {/* Back */}
                <Link href="/sales" className="inline-flex items-center gap-2 font-sans text-xs tracking-wider uppercase" style={{ color: 'rgba(6,161,92,0.6)' }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
                </Link>

                {/* Header */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>{itin.customerName || "Unnamed Itinerary"}</h1>
                        {itin.quoteId && (
                            <span className="font-sans text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 uppercase tracking-widest mt-1">
                                {itin.quoteId}
                            </span>
                        )}
                    </div>
                    <p className="font-sans text-xs sm:text-sm mt-1" style={{ color: 'rgba(5,34,16,0.6)' }}>{itin.destination} · {itin.nights}N/{itin.days}D</p>
                    <div className="flex flex-wrap gap-2">
                        {/* Edit button — locked once itinerary leaves sales hands */}
                        {(() => {
                            const isAdminOrOwner = userProfile?.role === "admin" || userProfile?.role === "owner"
                            const lockedStatuses = ["handover", "pre-ops", "post-ops", "completed"]
                            const isLocked = lockedStatuses.includes(itin.status) && !isAdminOrOwner
                            const editUrl = `/sales/itinerary-generator/${itin?.module === 'built-package' ? 'build-package' : 'custom'}?editId=${itinId}`
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
                        {userProfile?.role !== "sales" && (
                            <button
                                onClick={() => window.open(`/voucher/${itinId}`, '_blank')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                                style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.2)' }}
                            >
                                <FileText className="w-3 h-3" /> Voucher
                            </button>
                        )}
                        <Link
                            href={`/itinerary/${itinId}`}
                            target="_blank"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                            style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.2)' }}
                        >
                            <Eye className="w-3 h-3" /> ITINERARY
                        </Link>

                        <UpsellDownsellControl booking={itin} userProfile={userProfile} onSaved={loadAll} />

                        <button
                            onClick={handleShare}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                            style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c', border: '1px solid rgba(6,161,92,0.2)' }}
                        >
                            <Share2 className="w-3 h-3" /> Share
                        </button>

                        {/* Raise Token button — only for sales roles when itinerary is locked */}
                        {["handover", "pre-ops", "post-ops"].includes(itin.status) &&
                         ["sales", "sales_lead"].includes(userProfile?.role) && (
                            <button
                                onClick={() => setShowTokenModal(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-sans text-[10px] tracking-wider uppercase transition-all hover:scale-105"
                                style={{
                                    background: myToken?.status === "pending" ? 'rgba(251,191,36,0.1)' : 'rgba(99,102,241,0.1)',
                                    color: myToken?.status === "pending" ? '#b45309' : '#4f46e5',
                                    border: `1px solid ${myToken?.status === "pending" ? 'rgba(251,191,36,0.25)' : 'rgba(99,102,241,0.2)'}`,
                                }}
                            >
                                <Key className="w-3 h-3" />
                                {myToken?.status === "pending" ? "Token Pending" : "Raise Token"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Status pipeline */}
                {(() => {
                    const salesFlow = ["draft", "sent", "handover"]
                    const adminFlow = ["draft", "sent", "handover", "pre-ops", "post-ops", "completed"]
                    const visibleFlow = isSales ? salesFlow : (isAdmin ? adminFlow : statusFlow)
                    
                    const labels: Record<string, string> = {
                        draft: "Draft",
                        sent: "Sent",
                        handover: "Handover",
                        "pre-ops": "Pre Ops",
                        "post-ops": "Post Ops",
                        completed: "Completed"
                    }

                    // For Sales/Admin, the active index is determined differently
                    let activeIdx = statusFlow.indexOf(currentStatus)
                    if (isSales || isAdmin) {
                        activeIdx = visibleFlow.indexOf(currentStatus)
                        if (activeIdx === -1 && isAdmin) {
                            if (currentStatus === 'completed') activeIdx = 5
                            else activeIdx = visibleFlow.length - 1
                        }
                    }

                    return (
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {visibleFlow.map((status, i) => {
                                const isActive = i <= activeIdx
                                const color = statusColors[status] || "#1D9E75"
                                return (
                                    <div key={status} className="flex items-center gap-2">
                                        <span
                                            className="px-3 py-1.5 rounded-full font-sans text-[10px] font-bold tracking-wider uppercase whitespace-nowrap"
                                            style={{
                                                background: isActive ? `${color}20` : 'rgba(5,34,16,0.05)',
                                                color: isActive ? color : 'rgba(5,34,16,0.4)',
                                                border: `1px solid ${isActive ? `${color}40` : 'rgba(5,34,16,0.08)'}`,
                                            }}
                                        >
                                            {labels[status] || status}
                                        </span>
                                        {i < visibleFlow.length - 1 && <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(5,34,16,0.3)' }} />}
                                    </div>
                                )
                            })}
                        </div>
                    )
                })()}

                {/* ── Role-based action button ── */}
                {(() => {
                    // ADMIN & SALES: Early stages actions
                    if (currentStatus === "draft") {
                        return (
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => setShowSentConfirm(!showSentConfirm)}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-full font-sans text-[13px] tracking-wide transition-all hover:scale-105 shadow-xl shadow-emerald-900/10 active:scale-95"
                                    style={{ background: '#3182CE', color: '#FFFFFF' }}
                                >
                                    <Send className="w-4 h-4" /> Mark as Sent
                                </button>
                                {/* Inline confirmation — sits right beside the button */}
                                {showSentConfirm && (
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-gray-200 shadow-lg animate-in fade-in slide-in-from-left-2 duration-200">
                                        <span className="font-sans text-[11px] text-gray-600 whitespace-nowrap">Mark as sent to client?</span>
                                        <button onClick={handleMarkAsSent} className="py-1.5 px-3 rounded-lg bg-[#3182CE] text-white font-sans text-[10px] font-bold uppercase">Confirm</button>
                                        <button onClick={() => setShowSentConfirm(false)} className="py-1.5 px-3 rounded-lg bg-gray-50 text-gray-500 font-sans text-[10px] font-bold uppercase border border-gray-100">Cancel</button>
                                    </div>
                                )}
                            </div>
                        )
                    }
                    if (currentStatus === "sent") {
                        return (
                            <button
                                onClick={() => { setPendingStatus("handover"); setShowChecklistModal(true) }}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-full font-sans text-[13px] tracking-wide transition-all hover:scale-105 shadow-xl shadow-emerald-900/10 active:scale-95"
                                style={{ background: '#1A4731', color: '#FFFFFF' }}
                            >
                                Collect Advance & Move to Handover <ChevronRight className="w-4 h-4" />
                            </button>
                        )
                    }

                    // Status Badges for later stages
                    if (currentStatus === "handover") {
                        return (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-full font-sans text-[11px] font-bold tracking-wider uppercase" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.25)' }}>
                                ✓ IN HANDOVER
                            </span>
                        )
                    }
                    if (currentStatus === "pre-ops" || currentStatus === "post-ops") {
                        return (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-full font-sans text-[11px] font-bold tracking-wider uppercase" style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
                                IN OPERATIONS
                            </span>
                        )
                    }
                    if (currentStatus === "completed") {
                        return (
                            <span className="px-4 py-2 rounded-full font-sans text-[11px] font-bold tracking-wider uppercase" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                                ✓ COMPLETED
                            </span>
                        )
                    }

                    return null
                })()}



                {/* Confirm Submit to Ops dialog */}
                {showConfirmOps && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setShowConfirmOps(false)}>
                        <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: '#FFFFFF', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                            <div>
                                <h2 className="font-serif text-xl tracking-wide mb-1" style={{ color: '#052210' }}>Submit to Operations?</h2>
                                <p className="font-sans text-sm" style={{ color: 'rgba(5,34,16,0.6)' }}>Are you sure you want to submit this to the Operations team? You will no longer manage this booking.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleSubmitToOps}
                                    disabled={stagingOps}
                                    className="flex-1 py-3 rounded-xl font-sans text-xs tracking-wider uppercase font-bold flex items-center justify-center gap-2 transition-all"
                                    style={{ background: '#052210', color: '#4ade80' }}
                                >
                                    {stagingOps ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4ade80', borderTopColor: 'transparent' }} /> : <Send className="w-4 h-4" />}
                                    {stagingOps ? 'Submitting...' : 'Yes, Submit'}
                                </button>
                                <button onClick={() => setShowConfirmOps(false)} className="px-5 py-3 rounded-xl font-sans text-xs tracking-wider uppercase font-semibold" style={{ border: '1.5px solid #e5e7eb', color: 'rgba(5,34,16,0.45)' }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs Navigation */}
                {(isAdmin || isSales || isOps) && (
                    <div className="flex items-center gap-4 border-b border-gray-100 overflow-x-auto no-scrollbar py-2">
                        {[
                            { id: 'trip-details', label: 'Trip Details', show: true },
                            { id: 'trip-notes', label: 'Trip Notes', show: true },
                            { id: 'handover-data', label: 'Sales Handover Data', show: isAdmin && currentStatus !== 'draft' && currentStatus !== 'sent' },
                            { id: 'ops-info', label: 'Ops Info', show: isAdmin && (currentStatus === 'post-ops' || currentStatus === 'completed') },
                            { 
                                id: 'pre-ops-checklist', 
                                label: 'Pre-Ops Checklist', 
                                show: isAdmin && (currentStatus === 'handover' || currentStatus === 'pre-ops' || currentStatus === 'completed'),
                                progress: (() => {
                                    const req = preOpsChecklist.filter(c => c.isRequired !== false)
                                    return { done: req.filter(c => c.checked).length, total: req.length }
                                })()
                            },
                            { 
                                id: 'post-ops-checklist', 
                                label: 'Post-Ops Checklist', 
                                show: isAdmin && (currentStatus === 'post-ops' || currentStatus === 'completed'),
                                progress: (() => {
                                    const req = postOpsChecklist.filter(c => c.isRequired !== false)
                                    return { done: req.filter(c => c.checked).length, total: req.length }
                                })()
                            }
                        ].filter(t => t.show !== false).map(tab => {
                            const isActive = activeTab === tab.id
                            const allDone = tab.progress && tab.progress.total > 0 && tab.progress.done === tab.progress.total
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 pb-3 px-1 transition-all border-b-2 whitespace-nowrap ${isActive ? 'border-[#1D9E75] text-[#1D9E75]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                >
                                    <span className="font-sans text-[13px] font-bold tracking-tight">{tab.label}</span>
                                    {tab.progress && tab.progress.total > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${allDone ? 'bg-[#1D9E75] text-white' : 'bg-gray-100 text-gray-500'}`}>
                                            {tab.progress.done}/{tab.progress.total}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Tab Content */}
                <div className="mt-6">
                    {/* TRIP DETAILS TAB */}
                    {(activeTab === 'trip-details') && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Customer info */}
                                <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                    <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Customer</h3>
                                    <div className="space-y-2 font-sans text-sm" style={{ color: 'rgba(5,34,16,0.8)' }}>
                                        <p><strong style={{ color: '#052210' }}>{itin.customerName}</strong></p>
                                        {itin.customerPhone && <p>{itin.customerPhone}</p>}
                                        {itin.customerEmail && <p>{itin.customerEmail}</p>}
                                    </div>
                                </div>

                                {/* Trip info */}
                                <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                    <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Trip</h3>
                                    <div className="space-y-2 font-sans text-sm" style={{ color: 'rgba(5,34,16,0.8)' }}>
                                        <p>{itin.destination} · {itin.nights}N/{itin.days}D</p>
                                        <p>{itin.startDate} → {itin.endDate}</p>
                                        <p>{itin.adults} Adults{itin.children > 0 ? `, ${itin.children} Children (${itin.childAge})` : ""}</p>
                                        {itin.placesCovered && <p>{itin.placesCovered}</p>}
                                    </div>
                                </div>

                                {/* Hotels */}
                                <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                    <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Hotels</h3>
                                    <div className="space-y-4">
                                        {(() => {
                                            const allPlans = itin.plans || pricing?.[0]?.plans || []
                                            const activePlan = itin.selectedPlanId 
                                                ? allPlans.find((p: any) => p.planId === itin.selectedPlanId)
                                                : null
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
                                                    <span className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{t.type} {t.vehicleType ? `· ${t.vehicleType}` : ""}</span>
                                                    <div className="flex flex-col mt-1 space-y-0.5">
                                                        {t.pickup && <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}><strong className="font-medium">Pickup:</strong> {t.pickup}</span>}
                                                        {t.drop && <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.6)' }}><strong className="font-medium">Drop:</strong> {t.drop}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Pricing */}
                                <div className="rounded-2xl p-5" style={{ background: 'rgba(6,161,92,0.05)', border: '1px solid rgba(6,161,92,0.15)' }}>
                                    <h3 className="font-serif text-sm tracking-wider uppercase mb-4" style={{ color: '#06a15c' }}>Pricing</h3>
                                    {(itin.plans?.length > 0 || pricing?.[0]?.plans?.length > 0) ? (
                                        <div className="space-y-3">
                                            {(itin.plans || pricing?.[0]?.plans || []).map((p: any, i: number) => {
                                                const isSelected = itin.selectedPlanId && (itin.selectedPlanId === p.planId || itin.selectedPlanId === p.category)
                                                return (
                                                    <div key={i} className={`flex justify-between items-end border-b pb-2 last:border-0 last:pb-0 transition-all ${isSelected ? 'scale-[1.02] origin-left' : ''}`} style={{ borderColor: 'rgba(6,161,92,0.1)' }}>
                                                        <div className="flex items-center gap-2">
                                                            {isSelected && <div className="w-1 h-1 rounded-full bg-[#06a15c]" />}
                                                            <div>
                                                                <p className={`font-sans text-xs font-bold ${isSelected ? 'text-[#06a15c]' : 'text-[#052210]'}`}>{p.planName || p.hotelName || "Option"}</p>
                                                                <p className="font-sans text-[10px]" style={{ color: 'rgba(5,34,16,0.5)' }}>{p.category || "Standard"} | ₹{(p.perPersonPrice || 0).toLocaleString()} pp</p>
                                                            </div>
                                                        </div>
                                                        <p className={`font-serif text-lg font-bold ${isSelected ? 'text-[#06a15c]' : 'text-[#06a15c]/60'}`}>₹{(p.totalPrice ?? p.overrideTotal ?? p.total ?? 0).toLocaleString()}</p>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-serif text-3xl font-bold" style={{ color: '#06a15c' }}>₹{Number((itin.plans?.find((p:any) => p.planId === itin.selectedPlanId)?.totalPrice || itin.plans?.[0]?.totalPrice || 0) || 0).toLocaleString()}</p>
                                            <p className="font-sans text-xs mt-1" style={{ color: 'rgba(5,34,16,0.6)' }}>₹{Number((itin.plans?.find((p:any) => p.planId === itin.selectedPlanId)?.perPersonPrice || itin.plans?.[0]?.perPersonPrice || 0) || 0).toLocaleString()} per person</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Day Plans */}
                            <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(5,34,16,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                                <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(6,161,92,0.08)' }}>
                                    <h3 className="font-serif text-lg tracking-wide" style={{ color: '#06a15c' }}>Day Plans ({days.length})</h3>
                                </div>
                                {[...days].sort((a, b) => {
                                    const numA = parseInt((a.day || String(a.dayNumber || "")).replace(/\D/g, '')) || parseInt(a.dayNumber) || 0;
                                    const numB = parseInt((b.day || String(b.dayNumber || "")).replace(/\D/g, '')) || parseInt(b.dayNumber) || 0;
                                    return numA - numB;
                                }).map((day: any, idx: number) => {
                                    let displayDate = day.date;
                                    if (itin.startDate) {
                                        try {
                                            const baseDate = new Date(itin.startDate);
                                            if (!isNaN(baseDate.getTime())) {
                                                const currentDate = new Date(baseDate);
                                                currentDate.setDate(baseDate.getDate() + idx);
                                                displayDate = currentDate.toLocaleDateString("en-US", {
                                                    weekday: "short",
                                                    month: "short",
                                                    day: "numeric"
                                                }).toUpperCase();
                                            }
                                        } catch { }
                                    }
                                    return (
                                        <div key={day.id || idx} className="px-6 py-4" style={{ borderBottom: '1px solid rgba(6,161,92,0.05)' }}>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="px-2.5 py-0.5 rounded-full font-sans text-[10px] font-bold tracking-wider uppercase" style={{ background: 'rgba(6,161,92,0.12)', color: '#06a15c' }}>{day.day}</span>
                                                <span className="font-sans text-xs" style={{ color: 'rgba(5,34,16,0.5)' }}>{displayDate}</span>
                                            </div>
                                            <p className="font-sans text-sm font-semibold" style={{ color: '#052210' }}>{day.title}</p>
                                            {day.description && <p className="font-sans text-xs mt-1" style={{ color: 'rgba(5,34,16,0.7)' }}>{day.description}</p>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* TRIP NOTES TAB */}
                    {activeTab === 'trip-notes' && (
                        <div className="max-w-3xl mx-auto space-y-4">
                            <UpsellHistory booking={itin} />
                            <TripNotes itineraryId={itinId} />
                        </div>
                    )}

                    {/* SALES HANDOVER DATA TAB */}
                    {isAdmin && activeTab === 'handover-data' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                                <h3 className="font-serif text-xl mb-6 text-[#052210]">Sales Handover Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Handover Date</p>
                                            <p className="font-sans text-sm text-[#052210] font-medium">{itin.handoverDate || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Consultant</p>
                                            <p className="font-sans text-sm text-[#052210] font-medium">{itin.salesName || itin.createdBy || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quote Status</p>
                                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-sans text-[9px] font-bold uppercase tracking-wider">
                                                {itin.status === 'sent' ? 'SENT' : 'CONFIRMED'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mandatory Files</p>
                                        <div className="space-y-2">
                                            {salesChecklist.filter(c => c.fileUrl).flatMap((c) => {
                                                const urls = c.fileUrl.split(',').filter(Boolean);
                                                return urls.map((url: string, index: number) => {
                                                    const filename = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1));
                                                    return (
                                                        <a key={`${c.id}-${index}`} href={url} target="_blank" className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100 font-sans text-xs hover:border-[#1D9E75] transition-all">
                                                            <FileText className="w-4 h-4 text-[#1D9E75]" />
                                                            <span className="truncate flex-1 font-medium">{c.name || c.title} {urls.length > 1 ? `(${index + 1})` : ''} - <span className="text-gray-400 font-normal">{filename}</span></span>
                                                            <Download className="w-3.5 h-3.5 text-gray-400" />
                                                        </a>
                                                    );
                                                });
                                            })}
                                            {salesChecklist.filter(c => c.fileUrl).length === 0 && <p className="font-sans text-xs italic text-gray-400">No files uploaded by sales.</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Full handover details — every field Sales filled in (matches the Ops view) */}
                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                                <h3 className="font-serif text-xl mb-6 text-[#052210]">All Handover Information</h3>
                                {salesChecklist.length === 0 ? (
                                    <p className="font-sans text-sm italic text-gray-400">No handover information submitted yet.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                        {[...salesChecklist].sort((a: any, b: any) => (Number(a?.order ?? 1e9)) - (Number(b?.order ?? 1e9))).map((item: any) => {
                                            const files = item.fileUrl ? String(item.fileUrl).split(',').filter(Boolean) : []
                                            const hasText = item.response && String(item.response).trim()
                                            return (
                                                <div key={item.id} className="border-b border-gray-50 pb-3">
                                                    <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{item.name || item.title}</p>
                                                    {files.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {files.map((url: string, idx: number) => {
                                                                const fn = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1))
                                                                return (
                                                                    <a key={idx} href={url} target="_blank" className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100 font-sans text-xs hover:border-[#1D9E75] transition-all">
                                                                        <FileText className="w-3.5 h-3.5 text-[#1D9E75] flex-shrink-0" />
                                                                        <span className="truncate flex-1">{fn}</span>
                                                                        <Download className="w-3 h-3 text-gray-400" />
                                                                    </a>
                                                                )
                                                            })}
                                                        </div>
                                                    ) : hasText ? (
                                                        <p className="font-sans text-sm text-[#052210] font-medium whitespace-pre-wrap break-words">{item.response}</p>
                                                    ) : item.acknowledged ? (
                                                        <p className="font-sans text-sm text-emerald-600 font-medium">✓ Acknowledged</p>
                                                    ) : (
                                                        <p className="font-sans text-sm italic text-gray-300">Not provided</p>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* OPS INFO TAB */}
                    {isAdmin && activeTab === 'ops-info' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                                <h3 className="font-serif text-xl mb-6 text-[#052210]">Operations Context</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Booking Notes</p>
                                            <p className="font-sans text-sm text-[#052210]">{itin.notes || 'No special requests or internal notes provided.'}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Financial Status</p>
                                            <div className="flex justify-between items-center">
                                                <span className="font-sans text-xs text-emerald-800">Advance Paid</span>
                                                <span className="font-sans text-sm font-black text-emerald-600">₹{(itin.amountPaid || 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                            <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Current Operation Phase</p>
                                            <p className="font-sans text-sm text-[#052210] font-medium uppercase tracking-tight">{currentStatus}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PRE-OPS CHECKLIST TAB */}
                    {isAdmin && activeTab === 'pre-ops-checklist' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                                    <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-[#1D9E75]">Pre-Operations Checklist</h3>
                                    {currentStatus === "completed" && <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 font-sans text-[9px] font-bold uppercase">Archived Read-Only</span>}
                                </div>
                                <div className="px-6 py-5 bg-white border-b border-gray-50">
                                    {(() => {
                                        const req = preOpsChecklist.filter(c => c.isRequired !== false)
                                        const done = req.filter(c => c.checked).length
                                        const progress = req.length > 0 ? Math.round((done / req.length) * 100) : 0
                                        return (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Task Completion</span>
                                                    <span className="font-sans text-xs font-bold text-[#1D9E75]">{progress}%</span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-gray-50 overflow-hidden">
                                                    <div 
                                                        className="h-full rounded-full transition-all duration-500" 
                                                        style={{ 
                                                            width: `${progress}%`, 
                                                            background: progress === 100 ? '#1D9E75' : 'linear-gradient(90deg, #1D9E75, #34d399)' 
                                                        }} 
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {preOpsChecklist.map((item: any) => {
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

                                        const isReadOnly = currentStatus === "completed" || currentStatus === "post-ops"

                                        return (
                                            <div key={item.id} className="p-6 flex gap-4 transition-all hover:bg-gray-50/50 border-b last:border-0" style={{ borderColor: 'rgba(6,161,92,0.06)' }}>
                                                <button
                                                    disabled={isReadOnly || (!isAnswered && !item.checked)}
                                                    onClick={() => toggleChecklistItem('pre', item.id, item.checked)}
                                                    className={`mt-1 shrink-0 ${isReadOnly ? 'cursor-default' : (!isAnswered && !item.checked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110')}`}
                                                >
                                                    {item.checked ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <Circle className="w-6 h-6 text-gray-200" />}
                                                </button>
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <p className={`font-sans text-sm font-bold ${item.checked ? 'text-gray-300 line-through' : 'text-[#052210]'}`}>{item.name || item.title}</p>
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${isMandatory ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-400'}`}>{isMandatory ? 'Mandatory' : 'Optional'}</span>
                                                    </div>
                                                    
                                                    {!item.checked && !isReadOnly && (
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
                                                                        onChange={(e) => updateChecklistItemState('pre', item.id, { response: e.target.value })} 
                                                                        onClick={(e) => {
                                                                            try {
                                                                                e.currentTarget.showPicker();
                                                                            } catch (err) {}
                                                                        }}
                                                                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white font-sans text-xs text-[#0d3d2b] focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all cursor-pointer shadow-sm relative z-0"
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Text/Number Input */}
                                                            {(type === "TEXT INPUT" || type === "TEXT_INPUT" || type === "NUMBER INPUT" || type === "NUMBER_INPUT") && (
                                                                <input 
                                                                    type={type.includes("NUMBER") ? "number" : "text"}
                                                                    value={item.response || ""} 
                                                                    onChange={(e) => updateChecklistItemState('pre', item.id, { response: e.target.value })} 
                                                                    placeholder="Enter details..."
                                                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-xs outline-none focus:border-[#1D9E75] transition-all"
                                                                />
                                                            )}

                                                            {/* File Upload */}
                                                            {(type === "FILE UPLOAD" || type === "FILE_UPLOAD") && (
                                                                <div className="w-full">
                                                                    {!item.fileUrl ? (
                                                                        <div className="flex items-center gap-3">
                                                                            <input
                                                                                type="file"
                                                                                id={`pre-f-${item.id}`}
                                                                                className="hidden"
                                                                                onChange={(e) => handleChecklistFileUpload('pre', item.id, e.target.files?.[0])}
                                                                            />
                                                                            <label htmlFor={`pre-f-${item.id}`} className="cursor-pointer flex items-center gap-3 px-5 py-3 rounded-xl border-2 border-dashed border-gray-100 hover:border-[#1D9E75] hover:bg-emerald-50/30 transition-all group">
                                                                                <UploadCloud className="w-5 h-5 text-gray-400 group-hover:text-[#1D9E75]" />
                                                                                <div className="text-left">
                                                                                    <p className="font-sans text-[10px] font-bold text-gray-700 uppercase tracking-wider">Click to upload</p>
                                                                                    <p className="font-sans text-[9px] text-gray-400">PDF, JPG, PNG accepted</p>
                                                                                </div>
                                                                            </label>
                                                                            {uploadingChecklistItemId === item.id && <div className="w-4 h-4 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                                                            <a href={item.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 hover:underline">
                                                                                <FileText className="w-4 h-4" /> View Document
                                                                            </a>
                                                                            <button onClick={() => updateChecklistItemState('pre', item.id, { fileUrl: '' })} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors">
                                                                                <X className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    )}
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
                                                                                onClick={() => updateChecklistItemState('pre', item.id, { response: opt })}
                                                                                className={`px-4 py-1.5 rounded-full border font-sans text-[10px] font-semibold transition-all ${isSelected ? 'bg-emerald-50 border-[#1D9E75] text-emerald-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
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
                                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${item.acknowledged ? "bg-emerald-500 border-emerald-500" : "border-gray-300 group-hover:border-[#1D9E75]"}`}>
                                                                        {item.acknowledged && <CheckCircle className="w-3 h-3 text-white" />}
                                                                        <input 
                                                                            type="checkbox" 
                                                                            className="hidden" 
                                                                            checked={item.acknowledged || false}
                                                                            onChange={(e) => updateChecklistItemState('pre', item.id, { acknowledged: e.target.checked })}
                                                                        />
                                                                    </div>
                                                                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider">Yes, I have completed this step</span>
                                                                </label>
                                                            )}

                                                            {/* Helper Notes */}
                                                            {item.notes && (
                                                                <div className="flex gap-2 text-[10px] text-gray-400 italic bg-gray-50/50 p-2 rounded-lg border border-gray-100/50">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                    <span>{item.notes}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Pre-Ops Stage Action */}
                                {(currentStatus === 'handover' || currentStatus === 'pre-ops') && (
                                    <div className="p-8 bg-gray-50 border-t border-gray-100 flex flex-col items-center gap-3">
                                        {(() => {
                                            const req = preOpsChecklist.filter(c => c.isRequired !== false)
                                            const done = req.filter(c => c.checked).length
                                            const allDone = req.length > 0 && done === req.length
                                            return (
                                                <>
                                                    <p className="font-sans text-[11px] font-bold text-gray-400 uppercase tracking-wider">{done} of {req.length} mandatory tasks completed</p>
                                                    {/* Single action: Handover to Post-Ops (enabled once all mandatory tasks are done).
                                                        Moves the booking straight to post-ops, initialising the post-ops checklist. */}
                                                    <button
                                                        onClick={async () => {
                                                            if (currentStatus === 'handover') {
                                                                // keep the status flow consistent: pass through pre-ops first
                                                                await updateItineraryStatus(itinId, "pre-ops")
                                                            }
                                                            await initPostOpsChecklist(itinId)
                                                            await updateItineraryStatus(itinId, "post-ops")
                                                            await loadAll()
                                                            setActiveTab('post-ops-checklist')
                                                        }}
                                                        disabled={!allDone}
                                                        className={`flex items-center gap-2 px-10 py-3 rounded-full font-sans text-[13px] font-bold tracking-wide transition-all ${!allDone ? 'opacity-50 grayscale cursor-not-allowed bg-gray-200 text-gray-500' : 'hover:scale-105 shadow-xl shadow-emerald-900/10 active:scale-95 bg-[#1A4731] text-[#FFFFFF]'}`}
                                                    >
                                                        Handover to Post-Ops <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* POST-OPS CHECKLIST TAB */}
                    {isAdmin && activeTab === 'post-ops-checklist' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                                    <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-[#1D9E75]">Post-Operations Checklist</h3>
                                    {currentStatus === "completed" && <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 font-sans text-[9px] font-bold uppercase">Archived Read-Only</span>}
                                </div>
                                <div className="px-6 py-5 bg-white border-b border-gray-50">
                                    {(() => {
                                        const req = postOpsChecklist.filter(c => c.isRequired !== false)
                                        const done = req.filter(c => c.checked).length
                                        const progress = req.length > 0 ? Math.round((done / req.length) * 100) : 0
                                        return (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-widest">Task Completion</span>
                                                    <span className="font-sans text-xs font-bold text-[#1D9E75]">{progress}%</span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-gray-50 overflow-hidden">
                                                    <div 
                                                        className="h-full rounded-full transition-all duration-500" 
                                                        style={{ 
                                                            width: `${progress}%`, 
                                                            background: progress === 100 ? '#1D9E75' : 'linear-gradient(90deg, #1D9E75, #34d399)' 
                                                        }} 
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {postOpsChecklist.map((item: any) => {
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

                                        const isReadOnly = currentStatus === "completed"

                                        return (
                                            <div key={item.id} className="p-6 flex gap-4 transition-all hover:bg-gray-50/50 border-b last:border-0" style={{ borderColor: 'rgba(6,161,92,0.06)' }}>
                                                <button
                                                    disabled={isReadOnly || (!isAnswered && !item.checked)}
                                                    onClick={() => toggleChecklistItem('post', item.id, item.checked)}
                                                    className={`mt-1 shrink-0 ${isReadOnly ? 'cursor-default' : (!isAnswered && !item.checked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110')}`}
                                                >
                                                    {item.checked ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <Circle className="w-6 h-6 text-gray-200" />}
                                                </button>
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <p className={`font-sans text-sm font-bold ${item.checked ? 'text-gray-300 line-through' : 'text-[#052210]'}`}>{item.name || item.title}</p>
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${isMandatory ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-400'}`}>{isMandatory ? 'Mandatory' : 'Optional'}</span>
                                                    </div>
                                                    
                                                    {!item.checked && !isReadOnly && (
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
                                                                        onChange={(e) => updateChecklistItemState('post', item.id, { response: e.target.value })} 
                                                                        onClick={(e) => {
                                                                            try {
                                                                                e.currentTarget.showPicker();
                                                                            } catch (err) {}
                                                                        }}
                                                                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white font-sans text-xs text-[#0d3d2b] focus:ring-2 focus:ring-[#1D9E75]/10 focus:border-[#1D9E75] outline-none transition-all cursor-pointer shadow-sm relative z-0"
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Text/Number Input */}
                                                            {(type === "TEXT INPUT" || type === "TEXT_INPUT" || type === "NUMBER INPUT" || type === "NUMBER_INPUT") && (
                                                                <input 
                                                                    type={type.includes("NUMBER") ? "number" : "text"}
                                                                    value={item.response || ""} 
                                                                    onChange={(e) => updateChecklistItemState('post', item.id, { response: e.target.value })} 
                                                                    placeholder="Enter details..."
                                                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 font-sans text-xs outline-none focus:border-[#1D9E75] transition-all"
                                                                />
                                                            )}

                                                            {/* File Upload */}
                                                            {(type === "FILE UPLOAD" || type === "FILE_UPLOAD") && (
                                                                <div className="w-full">
                                                                    {!item.fileUrl ? (
                                                                        <div className="flex items-center gap-3">
                                                                            <input
                                                                                type="file"
                                                                                id={`post-f-${item.id}`}
                                                                                className="hidden"
                                                                                onChange={(e) => handleChecklistFileUpload('post', item.id, e.target.files?.[0])}
                                                                            />
                                                                            <label htmlFor={`post-f-${item.id}`} className="cursor-pointer flex items-center gap-3 px-5 py-3 rounded-xl border-2 border-dashed border-gray-100 hover:border-[#1D9E75] hover:bg-emerald-50/30 transition-all group">
                                                                                <UploadCloud className="w-5 h-5 text-gray-400 group-hover:text-[#1D9E75]" />
                                                                                <div className="text-left">
                                                                                    <p className="font-sans text-[10px] font-bold text-gray-700 uppercase tracking-wider">Click to upload</p>
                                                                                    <p className="font-sans text-[9px] text-gray-400">PDF, JPG, PNG accepted</p>
                                                                                </div>
                                                                            </label>
                                                                            {uploadingChecklistItemId === item.id && <div className="w-4 h-4 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                                                            <a href={item.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 hover:underline">
                                                                                <FileText className="w-4 h-4" /> View Document
                                                                            </a>
                                                                            <button onClick={() => updateChecklistItemState('post', item.id, { fileUrl: '' })} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors">
                                                                                <X className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    )}
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
                                                                                onClick={() => updateChecklistItemState('post', item.id, { response: opt })}
                                                                                className={`px-4 py-1.5 rounded-full border font-sans text-[10px] font-semibold transition-all ${isSelected ? 'bg-emerald-50 border-[#1D9E75] text-emerald-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
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
                                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${item.acknowledged ? "bg-emerald-500 border-emerald-500" : "border-gray-300 group-hover:border-[#1D9E75]"}`}>
                                                                        {item.acknowledged && <CheckCircle className="w-3 h-3 text-white" />}
                                                                        <input 
                                                                            type="checkbox" 
                                                                            className="hidden" 
                                                                            checked={item.acknowledged || false}
                                                                            onChange={(e) => updateChecklistItemState('post', item.id, { acknowledged: e.target.checked })}
                                                                        />
                                                                    </div>
                                                                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider">Yes, I have completed this step</span>
                                                                </label>
                                                            )}

                                                            {/* Helper Notes */}
                                                            {item.notes && (
                                                                <div className="flex gap-2 text-[10px] text-gray-400 italic bg-gray-50/50 p-2 rounded-lg border border-gray-100/50">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                    <span>{item.notes}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Post-Ops Stage Action */}
                                {currentStatus === 'post-ops' && (
                                    <div className="p-8 bg-gray-50 border-t border-gray-100 flex flex-col items-center gap-3">
                                        {(() => {
                                            const req = postOpsChecklist.filter(c => c.isRequired !== false)
                                            const done = req.filter(c => c.checked).length
                                            const allDone = req.length > 0 && done === req.length
                                            return (
                                                <>
                                                    <p className="font-sans text-[11px] font-bold text-gray-400 uppercase tracking-wider">{done} of {req.length} mandatory tasks completed</p>
                                                    <button
                                                        onClick={async () => {
                                                            await updateItineraryStatus(itinId, "completed")
                                                            await loadAll()
                                                        }}
                                                        disabled={!allDone}
                                                        className={`flex items-center gap-2 px-10 py-3 rounded-full font-sans text-[13px] font-bold tracking-wide transition-all ${!allDone ? 'opacity-50 grayscale cursor-not-allowed bg-gray-200 text-gray-500' : 'hover:scale-105 shadow-xl shadow-emerald-900/10 active:scale-95 bg-[#1A4731] text-[#FFFFFF]'}`}
                                                    >
                                                        Mark as Completed <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Raise Token Modal */}
        {showTokenModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,34,16,0.4)', backdropFilter: 'blur(4px)' }}>
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                                <Key className="w-4 h-4 text-indigo-500" />
                            </div>
                            <div>
                                <h2 className="font-sans text-sm font-bold text-gray-800">Request Edit Access</h2>
                                <p className="font-sans text-[10px] text-gray-400 mt-0.5">
                                    Managed by {itin?.status === "post-ops" ? "Post-Ops" : "Pre-Ops"}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => { setShowTokenModal(false); setTokenReason("") }} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="font-sans text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                            Reason for edit access
                        </label>
                        <textarea
                            value={tokenReason}
                            onChange={e => setTokenReason(e.target.value)}
                            placeholder="Explain why you need to edit this itinerary…"
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-xl font-sans text-sm resize-none outline-none"
                            style={{ border: '1px solid rgba(5,34,16,0.12)', background: '#f8faf9' }}
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => { setShowTokenModal(false); setTokenReason("") }}
                            className="px-4 py-2 rounded-xl font-sans text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleRaiseToken}
                            disabled={!tokenReason.trim() || tokenSubmitting}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl font-sans text-xs font-bold uppercase tracking-wider transition-all"
                            style={{
                                background: tokenReason.trim() ? '#4f46e5' : '#e2e8f0',
                                color: tokenReason.trim() ? '#fff' : '#94a3b8',
                                cursor: tokenReason.trim() ? 'pointer' : 'not-allowed',
                            }}
                        >
                            <Send className="w-3.5 h-3.5" />
                            {tokenSubmitting ? "Sending…" : "Send Request"}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Payment Collection Modal */}
        <PaymentCollectionModal
            isOpen={showPaymentModal}
            onClose={() => { setShowPaymentModal(false); setPendingStatus(null) }}
            onSubmit={handlePaymentSubmit}
            itineraryName={itin?.customerName || "Itinerary"}
            totalPrice={itin?.upsell?.totalAmount != null ? Number(itin.upsell.totalAmount) : Number(itin?.totalPrice || 0)}
            amountAlreadyPaid={Number(itin?.amountPaid || 0)}
            defaultType="advance"
            title="Collect Advance Payment"
            submitLabel="Save Payment & Move to Handover"
            plans={itin?.upsell?.totalAmount != null ? [] : (pricing?.[0]?.plans ?? [])}
            itineraryId={itinId}
        />
        </>
    )
}
