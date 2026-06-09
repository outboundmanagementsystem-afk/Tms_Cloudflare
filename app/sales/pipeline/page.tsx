"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { getItineraries, updateItineraryStatus, getSalesChecklist, getUsers } from "@/lib/firestore"
import { UpsellBadge } from "@/components/upsell-downsell"
import type { ItineraryStatus } from "@/lib/firestore"
import Link from "next/link"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"
import { FileText, Calendar, MapPin, DollarSign, X, AlertTriangle, CheckCircle2 } from "lucide-react"
import { StatusDialog } from "@/components/ui/StatusDialog"
import { useAuth } from "@/lib/auth-context"

const columns = [
    { id: "draft", label: "DRAFT", color: "#718096" },
    { id: "sent", label: "SENT TO CLIENT", color: "#3182CE" },
    { id: "handover", label: "HANDOVER", color: "#1D9E75" },
]

export default function PipelinePage() {
    return (
        <ProtectedRoute allowedRoles={["sales", "sales_lead", "admin"]}>
            <KanbanBoard />
        </ProtectedRoute>
    )
}

function KanbanBoard() {
    const { userProfile } = useAuth()
    const [itineraries, setItineraries] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")

    // Dialog states
    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogType, setDialogType] = useState<"success" | "error" | "warning">("success")
    const [dialogTitle, setDialogTitle] = useState("")
    const [dialogMessage, setDialogMessage] = useState("")

    const showStatus = (type: "success" | "error" | "warning", title: string, message: string) => {
        setDialogType(type)
        setDialogTitle(title)
        setDialogMessage(message)
        setDialogOpen(true)
    }

    useEffect(() => { loadData() }, [userProfile])

    const loadData = async () => {
        if (!userProfile?.uid) return

        const role = userProfile.role
        if (role === 'admin' || role === 'owner') {
            // Admin/owner: every booking across the agency.
            const all = await getItineraries()
            setItineraries(all)
        } else if (role === 'sales_lead') {
            // Sales lead: own bookings + every team member's (members have leadId = this lead's uid),
            // so partial "Not Completed" drafts from the team also surface here under Draft.
            const [all, users] = await Promise.all([getItineraries(), getUsers()])
            const memberUids = (users as any[]).filter(u => u.leadId === userProfile.uid).map(u => u.uid)
            const allowed = new Set([userProfile.uid, ...memberUids])
            setItineraries((all as any[]).filter(i => allowed.has(i.createdBy)))
        } else {
            // Individual sales rep: own bookings only.
            const all = await getItineraries(userProfile.uid)
            setItineraries(all)
        }
        setLoading(false)
    }

    const handleDragEnd = async (result: any) => {
        if (!result.destination) return
        const newStatus = result.destination.droppableId as ItineraryStatus
        const itinId = result.draggableId

        // SOP Gate: if moving to "handover", check SOPs first
        if (newStatus === "handover") {
            try {
                const salesChecklist = await getSalesChecklist(itinId)
                if (salesChecklist.length > 0) {
                    const allChecked = salesChecklist.every((c: any) => c.checked)
                    if (!allChecked) {
                        showStatus("warning", "Checklist Incomplete", "Please complete the Sales Pre-Handover Checklist in the itinerary view before moving to Handover.")
                        return // Don't move yet
                    }
                }
            } catch (e) { console.error(e) }
        }
        
        const extraData: any = {}
        if (newStatus === "handover") {
            extraData.salesName = userProfile?.name || "Sales Person"
            extraData.handoverDate = new Date().toISOString().split('T')[0]
            extraData.assignedBySalesId = userProfile?.uid || ""
            extraData.assignedBySalesName = userProfile?.name || ""
        }
        
        try {
            await updateItineraryStatus(itinId, newStatus, extraData)
            setItineraries(prev => prev.map(it => it.id === itinId ? { ...it, status: newStatus, ...extraData } : it))
        } catch (err: any) {
            console.error(err)
            showStatus("warning", "No Pre-Ops Available", err.message || "No available Pre-Ops employee found. Please update team availability or assign manually.")
        }
    }

    // Filter by search
    const filteredItins = itineraries.filter(it => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (it.customerName || "").toLowerCase().includes(q)
            || (it.quoteId || "").toLowerCase().includes(q)
            || (it.customerPhone || "").includes(q)
            || (it.destination || "").toLowerCase().includes(q)
    })

    const formatDate = (dateStr: string) => {
        if (!dateStr) return ""
        try {
            const d = new Date(dateStr)
            return d.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })
        } catch (e) { return dateStr }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="font-serif text-2xl sm:text-3xl tracking-wide" style={{ color: '#052210' }}>Pipeline</h1>
                <div className="relative w-full sm:w-auto">
                    <input value={search} onChange={e => setSearch(e.target.value)} className="pl-10 pr-4 py-2.5 rounded-xl font-sans text-sm w-full sm:w-64" placeholder="Search quote ID, phone, name..." style={{ border: '1px solid rgba(5,34,16,0.08)', outline: 'none', background: '#fff' }} />
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(5,34,16,0.3)' }} />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
                </div>
            ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
                        {columns.map(col => {
                            const colItems = filteredItins.filter((it: any) => {
                                if (col.id === "handover") {
                                    return ["handover", "pre-ops", "post-ops", "completed"].includes(it.status)
                                }
                                return (it.status || "draft") === col.id
                            })
                            return (
                                <Droppable droppableId={col.id} key={col.id}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className="flex-shrink-0 w-80 rounded-2xl flex flex-col"
                                            style={{
                                                background: snapshot.isDraggingOver ? '#f8faf9' : '#FFFFFF',
                                                border: `1px solid ${snapshot.isDraggingOver ? 'rgba(5,34,16,0.1)' : 'rgba(5,34,16,0.06)'}`,
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            {/* Column header */}
                                            <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(5,34,16,0.04)' }}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                                                    <span className="font-sans text-xs font-bold tracking-wider uppercase" style={{ color: col.color }}>{col.label}</span>
                                                </div>
                                                <span className="font-sans text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${col.color}15`, color: col.color }}>
                                                    {colItems.length}
                                                </span>
                                            </div>

                                            {/* Cards */}
                                            <div className="flex-1 p-3 space-y-3 min-h-[100px]">
                                                {colItems.map((itin: any, idx: number) => (
                                                    <Draggable isDragDisabled={true} key={itin.id} draggableId={itin.id} index={idx}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className="rounded-2xl p-4 transition-all"
                                                                style={{
                                                                    ...provided.draggableProps.style,
                                                                    background: snapshot.isDragging ? '#f8faf9' : '#FFFFFF',
                                                                    border: `1px solid ${snapshot.isDragging ? 'rgba(5,34,16,0.2)' : 'rgba(5,34,16,0.08)'}`,
                                                                    boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.05)' : '0 2px 10px rgba(0,0,0,0.02)'
                                                                }}
                                                            >
                                                                <Link href={`/sales/itinerary/${itin.id}`}>
                                                                    <div className="flex items-start justify-between mb-2">
                                                                        <div className="min-w-0 pr-2">
                                                                            <p className="font-sans text-sm font-bold truncate" style={{ color: '#052210' }}>{itin.customerName || "Unnamed"}</p>
                                                                            <UpsellBadge itinerary={itin} className="mt-1" />
                                                                        </div>
                                                                        {itin.quoteId && <span className="font-sans text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase flex-shrink-0">{itin.quoteId}</span>}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 mt-2">
                                                                        <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(5,34,16,0.3)' }} />
                                                                        <span className="font-sans text-[11px] truncate" style={{ color: 'rgba(5,34,16,0.5)' }}>{itin.destination || "—"}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between mt-3">
                                                                        <span className="font-sans text-[11px] font-medium" style={{ color: 'rgba(5,34,16,0.4)' }}>{itin.nights || 0}N/{itin.days || 0}D</span>
                                                                        {(itin.plans?.find((p:any) => p.planId === itin.selectedPlanId)?.totalPrice || itin.plans?.[0]?.totalPrice || 0) && <span className="font-sans text-xs font-bold" style={{ color: '#1D9E75' }}>₹{Number((itin.plans?.find((p:any) => p.planId === itin.selectedPlanId)?.totalPrice || itin.plans?.[0]?.totalPrice || 0)).toLocaleString()}</span>}
                                                                    </div>
                                                                    <div className="mt-4 pt-3 border-t border-[rgba(5,34,16,0.04)]">
                                                                        <p className="font-sans text-[10px] uppercase tracking-wider" style={{ color: 'rgba(5,34,16,0.4)' }}>
                                                                            {col.id === "draft" && `Created: ${formatDate(itin.createdAt)}`}
                                                                            {col.id === "sent" && `Sent: ${formatDate(itin.sentAt)}`}
                                                                            {col.id === "handover" && `Handover: ${formatDate(itin.handoverDate || itin.updatedAt)}`}
                                                                        </p>
                                                                    </div>
                                                                </Link>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>
                            )
                        })}
                    </div>
                </DragDropContext>
            )}

            <StatusDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                type={dialogType}
                title={dialogTitle}
                message={dialogMessage}
            />
        </div>
    )
}
