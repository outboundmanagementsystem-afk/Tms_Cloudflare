"use client"

import { useAuth } from "@/lib/auth-context"
import { goToHub } from "@/lib/hub"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import { getTripType, balanceReminderDays, daysUntil, balanceDue } from "@/lib/trip-type"
import { playNotificationSound, initNotificationSound } from "@/lib/notify-sound"
import {
    LayoutDashboard, MapPin, Users, BarChart3, KanbanSquare,
    Settings, LogOut, Menu, X, ChevronLeft, ClipboardCheck,
    Package, FileText, ClipboardList, CreditCard, DollarSign, Receipt, Search, Sparkles, Trophy, Key, Bell, ArrowRight, Building2, Target, PhoneCall, CalendarDays, Star
} from "lucide-react"
import { AiAssistantWidget } from "@/components/ai-assistant"

const navigation: Record<string, any[]> = {
    admin: [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'KPI Analytics', href: '/admin/kpi', icon: BarChart3 },
        { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
        { name: 'Pipeline', href: '/admin/kanban', icon: KanbanSquare },
        { name: 'Pending Tasks', href: '/admin/pending', icon: CreditCard },
        { name: 'Lead Engine', href: '/admin/leads', icon: ClipboardCheck },
        { name: 'Customers', href: '/admin/customers', icon: ClipboardList },
        { name: 'SOPs', href: '/admin/sops', icon: ClipboardCheck },
        { name: 'Destinations', href: '/admin/destinations', icon: MapPin },
        { name: 'Itinerary Generators', href: '/admin/itinerary-generator', icon: FileText },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
        { name: 'Settings', href: '/admin/settings', icon: Settings },
        { divider: true, name: 'Finance', icon: DollarSign },
        { name: 'Finance Dashboard', href: '/finance', icon: DollarSign },
        { name: 'Finance Payments', href: '/finance/payments', icon: Receipt },
        { name: 'Finance Invoices', href: '/finance/invoices', icon: FileText },
        { name: 'Finance Register', href: '/finance/register', icon: BarChart3 },
    ],
    owner: [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'KPI Analytics', href: '/admin/kpi', icon: BarChart3 },
        { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
        { name: 'Pipeline', href: '/admin/kanban', icon: KanbanSquare },
        { name: 'Pending Tasks', href: '/admin/pending', icon: CreditCard },
        { name: 'Lead Engine', href: '/admin/leads', icon: ClipboardCheck },
        { name: 'Customers', href: '/admin/customers', icon: ClipboardList },
        { name: 'SOPs', href: '/admin/sops', icon: ClipboardCheck },
        { name: 'Destinations', href: '/admin/destinations', icon: MapPin },
        { name: 'Itinerary Generators', href: '/admin/itinerary-generator', icon: FileText },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
        { name: 'Settings', href: '/admin/settings', icon: Settings },
        { divider: true, name: 'Finance', icon: DollarSign },
        { name: 'Finance Dashboard', href: '/finance', icon: DollarSign },
        { name: 'Finance Payments', href: '/finance/payments', icon: Receipt },
        { name: 'Finance Invoices', href: '/finance/invoices', icon: FileText },
        { name: 'Finance Register', href: '/finance/register', icon: BarChart3 },
    ],
    sales_lead: [
        { name: 'Dashboard', href: '/sales/dashboard', icon: LayoutDashboard },
        { name: 'All Leads', href: '/sales/leads', icon: KanbanSquare },
        { name: 'Call Dashboard', href: '/sales/calls', icon: PhoneCall },
        { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
        { name: 'Pipeline', href: '/sales/pipeline', icon: KanbanSquare },
        { name: 'My Team', href: '/sales/my-team', icon: Users },
        { name: "Today's Itineraries", href: '/sales/today', icon: CalendarDays },
        { name: 'Customers', href: '/sales/customers', icon: ClipboardList },
        { name: 'Your Drafts', href: '/sales/drafts', icon: FileText },
        { name: 'Itinerary Generators', href: '/sales/itinerary-generator', icon: FileText },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
    ],
    sales: [
        { name: "Today's Work", href: '/sales/today', icon: ClipboardCheck },
        { name: 'All Leads', href: '/sales/leads', icon: KanbanSquare },
        { name: 'Call Dashboard', href: '/sales/calls', icon: PhoneCall },
        { name: 'Dashboard', href: '/sales/dashboard', icon: LayoutDashboard },
        { name: 'My Target', href: '/sales/target', icon: Target },
        { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
        { name: 'Pipeline', href: '/sales/pipeline', icon: KanbanSquare },
        { name: "Today's Itineraries", href: '/sales/today', icon: CalendarDays },
        { name: 'Customers', href: '/sales/customers', icon: ClipboardList },
        { name: 'Your Drafts', href: '/sales/drafts', icon: FileText },
        { name: 'Itinerary Generators', href: '/sales/itinerary-generator', icon: FileText },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
    ],
    ops_lead: [
        { name: 'Dashboard', href: '/ops', icon: Package },
        { name: 'My KPIs', href: '/ops/kpi', icon: BarChart3 },
        { name: 'My Team', href: '/ops/my-team', icon: Users },
        { name: 'Profile', href: '/ops/profile', icon: Settings },
        { name: 'Pipeline', href: '/ops/pipeline', icon: KanbanSquare },
        { name: 'Customers', href: '/ops/customers', icon: ClipboardList },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
    ],
    pre_ops_lead: [
        { name: 'Dashboard', href: '/ops', icon: Package },
        { name: 'Pipeline', href: '/ops/pipeline', icon: KanbanSquare },
        { name: 'Pending Tokens', href: '/ops/pending-tokens', icon: Key },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
        { name: 'My Team', href: '/ops/my-team', icon: Users },
        { name: 'Itinerary Generators', href: '/ops/itinerary-generator', icon: FileText },
    ],
    pre_ops: [
        { name: 'Dashboard', href: '/ops', icon: Package },
        { name: 'Pipeline', href: '/ops/pipeline', icon: KanbanSquare },
        { name: 'Pending Tokens', href: '/ops/pending-tokens', icon: Key },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
        { name: 'Itinerary Generators', href: '/ops/itinerary-generator', icon: FileText },
    ],
    ops: [
        { name: 'Dashboard', href: '/ops', icon: Package },
        { name: 'My KPIs', href: '/ops/kpi', icon: BarChart3 },
        { name: 'Customers', href: '/ops/customers', icon: ClipboardList },
        { name: 'Profile', href: '/ops/profile', icon: Settings },
        { name: 'Pipeline', href: '/ops/pipeline', icon: KanbanSquare },
    ],
    post_ops_lead: [
        { name: 'Dashboard', href: '/post-ops', icon: ClipboardCheck },
        { name: 'Pipeline', href: '/post-ops/pipeline', icon: KanbanSquare },
        { name: 'Feedback / NPS', href: '/post-ops/feedback', icon: Star },
        { name: 'Pending Tokens', href: '/post-ops/pending-tokens', icon: Key },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
        { name: 'My Team', href: '/post-ops/my-team', icon: Users },
    ],
    post_ops: [
        { name: 'Dashboard', href: '/post-ops', icon: ClipboardCheck },
        { name: 'Pipeline', href: '/post-ops/pipeline', icon: KanbanSquare },
        { name: 'Feedback / NPS', href: '/post-ops/feedback', icon: Star },
        { name: 'Pending Tokens', href: '/post-ops/pending-tokens', icon: Key },
        { name: 'DMC Management', href: '/dmc', icon: Building2 },
    ],
    finance_lead: [
        { name: 'Dashboard', href: '/finance', icon: DollarSign },
        { name: 'Payments', href: '/finance/payments', icon: Receipt },
        { name: 'Invoices', href: '/finance/invoices', icon: FileText },
        { name: 'Register', href: '/finance/register', icon: BarChart3 },
        { name: 'My Team', href: '/finance/my-team', icon: Users },
    ],
    finance: [
        { name: 'Dashboard', href: '/finance', icon: DollarSign },
        { name: 'Payments', href: '/finance/payments', icon: Receipt },
        { name: 'Invoices', href: '/finance/invoices', icon: FileText },
        { name: 'Register', href: '/finance/register', icon: BarChart3 },
    ],
}

const roleLabel: Record<string, string> = {
    admin: 'Administrator',
    owner: 'Owner',
    sales: 'Sales',
    sales_lead: 'Sales Lead',
    ops: 'Operations',
    ops_lead: 'Ops Lead',
    pre_ops: 'Pre-Operations',
    pre_ops_lead: 'Pre-Ops Lead',
    post_ops: 'Post-Operations',
    post_ops_lead: 'Post-Ops Lead',
    finance: 'Finance',
    finance_lead: 'Finance Lead',
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { userProfile, loading, signOut } = useAuth()
    const router = useRouter()
    const pathname = usePathname()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)

    // Universal Search states
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [allItineraries, setAllItineraries] = useState<any[]>([])
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [loadingSearch, setLoadingSearch] = useState(false)
    const [pendingTokenCount, setPendingTokenCount] = useState(0)
    const [pendingTokens, setPendingTokens] = useState<any[]>([])
    const [assignedAlerts, setAssignedAlerts] = useState<any[]>([])
    const [alertsCollapsed, setAlertsCollapsed] = useState(false)
    // Pre-Ops balance-payment reminders (domestic <=3d / international <=15d before travel).
    const [balanceAlerts, setBalanceAlerts] = useState<any[]>([])
    const prevBalanceCount = useRef(0)
    // Token decisions on MY requests (approved/rejected) I haven't seen yet.
    const [tokenDecisions, setTokenDecisions] = useState<any[]>([])
    // Post-Ops: bookings travelling today (something to action).
    const [travelingToday, setTravelingToday] = useState<any[]>([])
    // Post-Ops feedback: trips whose NPS feedback is overdue (>7d) and detractor escalations.
    const [feedbackOverdue, setFeedbackOverdue] = useState<any[]>([])
    const [detractorAlerts, setDetractorAlerts] = useState<any[]>([])
    // Unified notification bell (combines all alert types).
    const [notifOpen, setNotifOpen] = useState(false)
    const prevNotifTotal = useRef(0)

    const handleSearchOpenClick = async () => {
        setSearchOpen(true)
        if (allItineraries.length === 0) {
            setLoadingSearch(true)
            try {
                const { getItineraries } = await import("@/lib/firestore")
                const itins = await getItineraries()
                setAllItineraries(itins || [])
            } catch (err) {
                console.error("Error loading itineraries for search:", err)
            } finally {
                setLoadingSearch(false)
            }
        }
    }

    const handleSearchQueryChange = (q: string) => {
        setSearchQuery(q)
        if (!q.trim()) {
            setSearchResults([])
            return
        }
        
        const cleanQuery = q.toLowerCase().trim()
        const cleanPhoneQuery = q.replace(/\D/g, '')

        const filtered = allItineraries.filter((itin: any) => {
            const customerName = (itin.customerName || '').toLowerCase()
            const id = (itin.id || '').toLowerCase()
            const phone = (itin.customerPhone || itin.customerPhoneNum || '').replace(/\D/g, '')
            const destination = (itin.destination || '').toLowerCase()
            const salesPerson = (itin.salesName || itin.consultantName || '').toLowerCase()

            return customerName.includes(cleanQuery) || 
                   id.includes(cleanQuery) || 
                   (cleanPhoneQuery && phone.includes(cleanPhoneQuery)) ||
                   destination.includes(cleanQuery) ||
                   salesPerson.includes(cleanQuery)
        })

        setSearchResults(filtered)
    }

    const getRedirectUrlForItinerary = (itin: any) => {
        const userRole = userProfile?.role

        // 1. Sales roles
        if (userRole === "sales" || userRole === "sales_lead") {
            return `/sales/itinerary/${itin.id}`
        }

        // 2. Pre-Ops roles
        if (userRole === "pre_ops" || userRole === "pre_ops_lead") {
            return `/ops/booking/${itin.id}`
        }

        // 3. Post-Ops roles
        if (userRole === "post_ops" || userRole === "post_ops_lead") {
            return `/post-ops/booking/${itin.id}`
        }

        // 4. Admin / Owner / Finance / Others
        // Follow status-based details route (which are shared admin details routes)
        if (itin.status === "post-ops" || itin.status === "completed") {
            return `/post-ops/booking/${itin.id}`
        }
        if (itin.status === "pre-ops" || itin.status === "handover") {
            return `/ops/booking/${itin.id}`
        }
        
        // Default to sales itinerary detail page for draft/sent/confirmed
        return `/sales/itinerary/${itin.id}`
    }

    const statusColors: Record<string, string> = {
        draft: "#9ca3af", sent: "#60a5fa", confirmed: "#34d399",
        handover: "#a78bfa", "pre-ops": "#a78bfa", "post-ops": "#f59e0b", completed: "#34d399"
    }

    // Command/Ctrl + K and Escape listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                handleSearchOpenClick()
            }
            if (e.key === 'Escape') {
                setSearchOpen(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [allItineraries])

    // Sidebar badge: number of pending access-token requests this role can act on.
    // Mirrors the filters on the Pending Tokens pages (pre-ops: handover/pre-ops,
    // post-ops: post-ops). Polls every 30s so the badge stays current.
    useEffect(() => {
        const role = userProfile?.role
        const isPre = role === "pre_ops" || role === "pre_ops_lead"
        const isPost = role === "post_ops" || role === "post_ops_lead"
        if (!isPre && !isPost) { setPendingTokenCount(0); setPendingTokens([]); return }

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        const load = async () => {
            try {
                const { getPendingTokensWithItineraries } = await import("@/lib/firestore")
                const all = await getPendingTokensWithItineraries()
                if (cancelled) return
                const mine = all.filter((t: any) => t.itinerary && (isPre
                    ? ["handover", "pre-ops"].includes(t.itinerary.status)
                    : t.itinerary.status === "post-ops"))
                setPendingTokens(mine)
                setPendingTokenCount(mine.length)
            } catch { /* ignore transient errors */ }
            finally { if (!cancelled) timer = setTimeout(load, 12000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.role])

    // Pre-Ops assignment alerts: bookings handed over by Sales and assigned to me that I
    // haven't acknowledged yet. The notification keeps showing (re-checked every 25s) until
    // the booking is opened and the handover acknowledged.
    useEffect(() => {
        const role = userProfile?.role
        const isPre = role === "pre_ops" || role === "pre_ops_lead" || role === "ops" || role === "ops_lead"
        if (!isPre || !userProfile?.uid) { setAssignedAlerts([]); return }

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const load = async () => {
            try {
                const { getItinerariesByStatus } = await import("@/lib/firestore")
                const handover = await getItinerariesByStatus("handover")
                if (cancelled) return
                const mine = (handover || []).filter((it: any) =>
                    (it.assignedPreOpsId === userProfile.uid || it.assignedOps === userProfile.uid) &&
                    !it.preOpsHandoverAcknowledged)
                setAssignedAlerts(mine)
                if (mine.length === 0) setAlertsCollapsed(false)
            } catch { /* ignore */ }
            finally { if (!cancelled) timer = setTimeout(load, 10000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.role, userProfile?.uid])

    // Pre-Ops balance-payment reminders: bookings nearing travel with money still owed.
    // Domestic -> within 3 days of start; International -> within 15 days. A pre_ops handler
    // sees bookings assigned to them; a pre_ops_lead sees the whole team's. Polls every 60s.
    useEffect(() => {
        const role = userProfile?.role
        const isPre = role === "pre_ops" || role === "ops"
        const isLead = role === "pre_ops_lead" || role === "ops_lead"
        if ((!isPre && !isLead) || !userProfile?.uid) { setBalanceAlerts([]); prevBalanceCount.current = 0; return }

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const load = async () => {
            try {
                const { getItinerariesByStatus } = await import("@/lib/firestore")
                const [handover, preOps] = await Promise.all([
                    getItinerariesByStatus("handover"),
                    getItinerariesByStatus("pre-ops"),
                ])
                if (cancelled) return
                const pool = [...(handover || []), ...(preOps || [])]
                const due = pool.filter((it: any) => {
                    const mine = isLead || it.assignedPreOpsId === userProfile.uid || it.assignedOps === userProfile.uid
                    if (!mine) return false
                    if (balanceDue(it) <= 0) return false
                    const days = daysUntil(it.startDate)
                    if (days === null || days < 0) return false
                    return days <= balanceReminderDays(getTripType(it))
                })
                prevBalanceCount.current = due.length
                setBalanceAlerts(due)
            } catch { /* ignore */ }
            finally { if (!cancelled) timer = setTimeout(load, 20000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.role, userProfile?.uid])

    // Token decisions: notify the REQUESTER when their access-token request is approved or
    // rejected, without a refresh. "Seen" decisions are remembered in localStorage so they
    // don't keep reappearing. Works for any role that requests tokens (sales/pre/post).
    useEffect(() => {
        if (!userProfile?.uid) { setTokenDecisions([]); return }
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const seenKey = "seenTokenDecisions"
        const getSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(seenKey) || "[]") } catch { return [] } }
        const load = async () => {
            try {
                const { getMyAccessTokens } = await import("@/lib/firestore")
                const mine = await getMyAccessTokens(userProfile.uid)
                if (cancelled) return
                const seen = getSeen()
                const decided = (mine || []).filter((t: any) =>
                    (t.status === "approved" || t.status === "rejected") && !seen.includes(`${t.id}:${t.status}`))
                setTokenDecisions(decided)
            } catch { /* ignore */ }
            finally { if (!cancelled) timer = setTimeout(load, 12000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.uid])

    const dismissTokenDecision = (t: any) => {
        try {
            const seenKey = "seenTokenDecisions"
            const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || "[]")
            const tag = `${t.id}:${t.status}`
            if (!seen.includes(tag)) { seen.push(tag); localStorage.setItem(seenKey, JSON.stringify(seen)) }
        } catch { /* ignore */ }
        setTokenDecisions(prev => prev.filter(x => x.id !== t.id))
    }

    // Post-Ops: bookings whose travel date is TODAY (action needed today).
    useEffect(() => {
        const role = userProfile?.role
        const isPost = role === "post_ops" || role === "post_ops_lead"
        if (!isPost) { setTravelingToday([]); return }
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const load = async () => {
            try {
                const { getItinerariesByStatus } = await import("@/lib/firestore")
                const post = await getItinerariesByStatus("post-ops")
                if (cancelled) return
                const today = (post || []).filter((it: any) => daysUntil(it.startDate) === 0)
                setTravelingToday(today)
            } catch { /* ignore */ }
            finally { if (!cancelled) timer = setTimeout(load, 20000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.role, userProfile?.uid])

    // Post-Ops feedback SLA: notify when a completed trip's NPS feedback is overdue (>7 days),
    // and escalate detractor scores (0–6) to the Post-Ops Lead. Detractor alerts are dismissed
    // via localStorage so they don't reappear once the lead has acted.
    useEffect(() => {
        const role = userProfile?.role
        const isPost = role === "post_ops" || role === "post_ops_lead"
        const isLead = role === "post_ops_lead" || role === "admin" || role === "owner"
        if (!isPost && !isLead) { setFeedbackOverdue([]); setDetractorAlerts([]); return }
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const seenKey = "seenDetractorAlerts"
        const getSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(seenKey) || "[]") } catch { return [] } }
        const load = async () => {
            try {
                const { getItinerariesByStatus } = await import("@/lib/firestore")
                const { isFeedbackOverdue, feedbackStatus, npsCategory } = await import("@/lib/nps")
                const completed = await getItinerariesByStatus("completed")
                if (cancelled) return
                setFeedbackOverdue((completed || []).filter((it: any) => isFeedbackOverdue(it)))
                if (isLead) {
                    const seen = getSeen()
                    setDetractorAlerts((completed || []).filter((it: any) =>
                        feedbackStatus(it.feedback) === "completed" &&
                        npsCategory(it.feedback?.npsScore) === "detractor" &&
                        !seen.includes(it.id)))
                } else {
                    setDetractorAlerts([])
                }
            } catch { /* ignore */ }
            finally { if (!cancelled) timer = setTimeout(load, 20000) }
        }
        load()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }, [userProfile?.role, userProfile?.uid])

    const dismissDetractor = (it: any) => {
        try {
            const seen: string[] = JSON.parse(localStorage.getItem("seenDetractorAlerts") || "[]")
            if (!seen.includes(it.id)) { seen.push(it.id); localStorage.setItem("seenDetractorAlerts", JSON.stringify(seen)) }
        } catch { /* ignore */ }
        setDetractorAlerts(prev => prev.filter(x => x.id !== it.id))
    }

    // Prime the notification sound so it can play later (browsers require a user gesture).
    useEffect(() => { initNotificationSound() }, [])

    // Unified bell: chime + auto-open the panel whenever the combined count grows.
    const notifTotal = balanceAlerts.length + pendingTokens.length + assignedAlerts.length + tokenDecisions.length + travelingToday.length + feedbackOverdue.length + detractorAlerts.length
    useEffect(() => {
        if (notifTotal > prevNotifTotal.current) {
            playNotificationSound()
            setNotifOpen(true)
        }
        if (notifTotal === 0) setNotifOpen(false)
        prevNotifTotal.current = notifTotal
    }, [notifTotal])

    // Show loading spinner while auth is resolving
    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center" style={{ background: '#F2F4F3' }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#06a15c', borderTopColor: 'transparent' }} />
                    <p className="font-sans text-sm tracking-widest uppercase" style={{ color: 'rgba(5,34,16,0.4)' }}>Loading...</p>
                </div>
            </div>
        )
    }

    // Auth loaded but no profile — pass children through so ProtectedRoute can render
    // its own error UI or redirect. Returning null here would show a blank screen.
    if (!userProfile) return <>{children}</>


    const role = userProfile.role
    const baseItems = navigation[role as keyof typeof navigation] || []
    // Inject the role-scoped AI Assistant link for every role (dedicated page).
    const items = baseItems.some((it: any) => it.href === "/assistant")
        ? baseItems
        : [...baseItems, { name: "Aura AI", href: "/assistant", icon: Sparkles }]

    // No logout inside a module — only the hub signs you out. This returns to
    // the Outbound Management hub with the session intact.
    const handleReturnToHub = () => {
        goToHub()
    }

    return (
        <div className="h-screen overflow-hidden flex" style={{ background: '#F2F4F3' }}>
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`
                    fixed lg:relative inset-y-0 left-0 z-50
                    h-full flex flex-col flex-shrink-0
                    transition-all duration-300 ease-in-out
                    lg:translate-x-0
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    ${isCollapsed ? 'w-[72px]' : 'w-64'}
                `}
                style={{
                    background: 'linear-gradient(180deg, #062814 0%, #052210 100%)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
                }}
            >
                <div className={`flex-shrink-0 flex items-center px-4 ${isCollapsed ? 'justify-center py-5' : 'justify-between py-4'}`}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {isCollapsed ? (
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-serif text-xl font-bold text-white"
                            style={{ background: 'rgba(6,161,92,0.2)', border: '1px solid rgba(6,161,92,0.3)' }}
                        >
                            O
                        </div>
                    ) : (
                        <>
                            <div className="relative w-40 h-[72px]">
                                <Image
                                    src="/images/outbound png.png"
                                    alt="Outbound Travelers"
                                    fill
                                    className="object-contain object-left scale-110 origin-left"
                                />
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4 text-white/60" />
                            </button>
                        </>
                    )}
                </div>

                {!isCollapsed && (
                    <div className="flex-shrink-0 px-4 pt-4 pb-2">
                        <div
                            className="flex items-center gap-2 px-3 py-2 rounded-lg"
                            style={{ background: 'rgba(6,161,92,0.08)', border: '1px solid rgba(6,161,92,0.15)' }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#06a15c', boxShadow: '0 0 6px #06a15c' }} />
                            <span
                                className="font-sans text-[11px] font-bold tracking-wider uppercase truncate"
                                style={{ color: '#4ade80' }}
                            >
                                {roleLabel[role] || role}
                            </span>
                        </div>
                    </div>
                )}

                {isCollapsed && <div className="flex-shrink-0 h-2" />}

                {/* Prominent Return-to-Hub — the only way back to the launcher. */}
                <div className={`flex-shrink-0 ${isCollapsed ? 'px-2 pb-2' : 'px-4 pb-3'}`}>
                    <button
                        onClick={handleReturnToHub}
                        title="Return to Outbound Management hub"
                        className={`w-full flex items-center gap-2 rounded-lg transition-all hover:brightness-110 ${isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'}`}
                        style={{ background: 'linear-gradient(135deg,#0f7a4a,#06a15c)', color: '#fff', boxShadow: '0 2px 10px rgba(6,161,92,0.35)' }}
                    >
                        <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                        {!isCollapsed && <span className="font-sans text-xs font-bold tracking-wide">Return to Hub</span>}
                    </button>
                </div>

                <nav
                    className={`flex-1 overflow-y-auto py-2 ${isCollapsed ? 'px-2' : 'px-3'}`}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {items.map((item: any) => {
                        if (item.divider) {
                            if (isCollapsed) return (
                                <div key={`divider-${item.name}`} className="my-1 mx-2 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                            )
                            return (
                                <div key={`divider-${item.name}`} className="px-2 pt-4 pb-1 flex items-center gap-2">
                                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                                    <span className="font-sans text-[9px] font-bold tracking-widest uppercase" style={{ color: 'rgba(74,222,128,0.5)' }}>{item.name}</span>
                                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                                </div>
                            )
                        }
                        const isActive = pathname === item.href ||
                            (item.href.split('/').length > 2 && pathname.startsWith(item.href))
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setSidebarOpen(false)}
                                title={isCollapsed ? item.name : undefined}
                                className={`
                                    relative flex items-center rounded-xl mb-0.5
                                    font-sans text-[13px] transition-all duration-150
                                    ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-2.5'}
                                `}
                                style={{
                                    background: isActive ? 'rgba(6,161,92,0.15)' : 'transparent',
                                    color: isActive ? '#4ade80' : 'rgba(255,255,255,0.65)',
                                    border: isActive ? '1px solid rgba(6,161,92,0.25)' : '1px solid transparent',
                                    fontWeight: isActive ? '600' : '400',
                                }}
                            >
                                <item.icon
                                    className="w-4 h-4 flex-shrink-0 transition-transform"
                                    style={{ color: isActive ? '#4ade80' : undefined }}
                                />
                                {!isCollapsed && (
                                    <span className="truncate leading-none">{item.name}</span>
                                )}
                                {/* Pending-tokens count badge */}
                                {item.name === 'Pending Tokens' && pendingTokenCount > 0 && (
                                    isCollapsed ? (
                                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                                    ) : (
                                        <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#ef4444', color: '#fff' }}>
                                            {pendingTokenCount}
                                        </span>
                                    )
                                )}
                                {!isCollapsed && isActive && !(item.name === 'Pending Tokens' && pendingTokenCount > 0) && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#06a15c' }} />
                                )}
                            </Link>
                        )
                    })}
                </nav>

                <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`
                            w-full flex items-center transition-colors duration-150
                            text-white/30 hover:text-white/70 hover:bg-white/5
                            ${isCollapsed ? 'justify-center py-3.5' : 'gap-3 px-5 py-3'}
                        `}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
                        {!isCollapsed && <span className="font-sans text-xs font-medium">Collapse sidebar</span>}
                    </button>

                    <div className={`flex items-center ${isCollapsed ? 'flex-col justify-center py-4 gap-2' : 'justify-between px-4 py-3'}`}>
                        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
                            <div
                                className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{ background: 'linear-gradient(135deg, #06a15c 0%, #059148 100%)' }}
                            >
                                {userProfile.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            {!isCollapsed && (
                                <div className="min-w-0">
                                    <p className="font-sans text-xs font-semibold text-white truncate leading-tight">{userProfile.name}</p>
                                    <p className="font-sans text-[10px] text-white/40 truncate capitalize">{roleLabel[role] || role}</p>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleReturnToHub}
                            title="Return to hub"
                            className={`
                                flex-shrink-0 flex items-center justify-center rounded-lg transition-all duration-150
                                text-white/30 hover:text-emerald-300 hover:bg-emerald-500/10
                                ${isCollapsed ? 'w-8 h-8' : 'w-7 h-7'}
                            `}
                        >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </aside>

            <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
                <header
                    className="flex-shrink-0 z-30 flex items-center justify-between px-5 py-3"
                    style={{
                        background: 'rgba(255,255,255,0.97)',
                        borderBottom: '1px solid rgba(5,34,16,0.07)',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <Menu className="w-5 h-5" style={{ color: '#052210' }} />
                        </button>

                        {/* Universal Search Bar Trigger */}
                        <div 
                            onClick={handleSearchOpenClick}
                            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:border-emerald-500/30 transition-all text-xs text-gray-400 font-sans cursor-pointer w-48 sm:w-64"
                        >
                            <Search className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate flex-1 select-none text-left">Search bookings, customers...</span>
                            <span className="hidden sm:inline-block text-[9px] bg-gray-200/60 text-gray-500 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">⌘K</span>
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        <div className="relative h-8">
                            <img
                                src="/images/outbound png.png"
                                alt="Outbound Travelers"
                                className="h-full w-auto object-contain"
                            />
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                    {children}
                </main>
            </div>

            {/* Global role-scoped AI assistant (floating) */}
            <AiAssistantWidget />

            {/* Universal Search Overlay Modal */}
            {searchOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-md">
                    <div 
                        className="fixed inset-0" 
                        onClick={() => setSearchOpen(false)}
                    />
                    <div 
                        className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[70vh] z-10 transition-all scale-100"
                        style={{ boxShadow: '0 20px 50px rgba(5,34,16,0.15)' }}
                    >
                        {/* Header Input */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                            <Search className="w-5 h-5 text-emerald-600 shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search Trip ID, customer, mobile, destination, sales owner..."
                                value={searchQuery}
                                onChange={(e) => handleSearchQueryChange(e.target.value)}
                                className="flex-1 bg-transparent border-0 outline-none focus:outline-none font-sans text-sm text-[#052210] placeholder-gray-400"
                            />
                            {loadingSearch ? (
                                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
                            ) : searchQuery ? (
                                <button onClick={() => handleSearchQueryChange("")} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <span className="font-mono text-[9px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 uppercase tracking-wider">ESC</span>
                            )}
                        </div>

                        {/* Search Results / Empty State */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[150px]">
                            {loadingSearch ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-2">
                                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                    <p className="font-sans text-xs text-gray-400">Loading bookings data...</p>
                                </div>
                            ) : !searchQuery ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <ClipboardList className="w-8 h-8 text-gray-300 mb-2" />
                                    <p className="font-sans text-sm font-semibold text-[#052210]">Search Outbound Bookings</p>
                                    <p className="font-sans text-xs text-gray-400 mt-1 max-w-xs">Type a customer's name, their phone number, a destination, or a specific Trip ID to view instant results.</p>
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <X className="w-8 h-8 text-red-400 bg-red-50 rounded-full p-2 mb-2" />
                                    <p className="font-sans text-sm font-semibold text-[#052210]">No bookings found</p>
                                    <p className="font-sans text-xs text-gray-400 mt-1">We couldn't find any trips matching "{searchQuery}"</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    <p className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 text-left">Search Results ({searchResults.length})</p>
                                    {searchResults.map((itin: any) => {
                                        const redirectUrl = getRedirectUrlForItinerary(itin)
                                        const statusLabel = itin.status || "draft"
                                        const isHandedOverToPostOps = itin.status === "post-ops" || itin.status === "completed"

                                        return (
                                            <Link
                                                key={itin.id}
                                                href={redirectUrl}
                                                onClick={() => setSearchOpen(false)}
                                                className="block p-3.5 rounded-xl border border-gray-100 bg-white hover:border-emerald-500/30 hover:bg-emerald-50/5 transition-all shadow-sm group text-left"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-sans text-xs font-bold text-[#052210] group-hover:text-emerald-700 transition-colors truncate">
                                                                {itin.customerName || "Unnamed Customer"}
                                                            </span>
                                                            <span className="font-mono text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                                                                #{itin.id?.slice(0, 8)}
                                                            </span>
                                                        </div>
                                                        <p className="font-sans text-[11px] text-gray-500 mt-1">
                                                            📍 {itin.destination || "Unnamed Destination"} · {itin.nights || 0}N/{itin.days || 0}D
                                                        </p>
                                                        <p className="font-sans text-[10px] text-gray-400 mt-0.5">
                                                            📅 {itin.startDate || "N/A"} → {itin.endDate || "N/A"}
                                                        </p>
                                                        
                                                        {/* Sales Owner & Details */}
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-50 font-sans text-[10px] text-gray-400">
                                                            <span>👤 Sales: <strong className="text-gray-600">{itin.salesName || itin.consultantName || "N/A"}</strong></span>
                                                            {itin.assignedOps && <span>🔧 Pre-Ops Assigned</span>}
                                                            {isHandedOverToPostOps && <span className="text-emerald-600 font-bold">✓ Moved to Post-Ops</span>}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                                                        <span 
                                                            className="px-2 py-0.5 rounded-full font-sans text-[9px] font-bold uppercase tracking-wider" 
                                                            style={{ 
                                                                background: `${statusColors[itin.status] || '#9ca3af'}15`, 
                                                                color: statusColors[itin.status] || '#9ca3af' 
                                                            }}
                                                        >
                                                            {statusLabel}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer Tips */}
                        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between font-sans text-[10px] text-gray-400">
                            <span>Use <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">ESC</kbd> to close</span>
                            <span>Powered by Outbound Travelers Search</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Unified notification bell — sits bottom-right, just above the Aura widget.
                One bell for all three alert types; each notification is its own card. */}
            {notifTotal > 0 && (
                <div className="fixed right-5 bottom-24 z-[61]">
                    {/* Panel opens upward, above the bell */}
                    {notifOpen && (
                        <div className="absolute right-0 bottom-[4.5rem] w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(5,34,16,0.08)' }}>
                            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#062814,#052210)' }}>
                                <div className="flex items-center gap-2">
                                    <span className="relative flex"><Bell className="w-4 h-4 text-[#4ade80]" /><span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" /></span>
                                    <span className="font-sans text-[12px] font-bold text-white tracking-wide">Notifications ({notifTotal})</span>
                                </div>
                                <button onClick={() => setNotifOpen(false)} className="text-white/60 hover:text-white" title="Minimise"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2.5" style={{ background: '#f7f9f8' }}>

                                {/* Payment pending cards */}
                                {balanceAlerts.map((a: any) => {
                                    const type = getTripType(a); const days = daysUntil(a.startDate); const bal = balanceDue(a)
                                    return (
                                        <Link key={`bal-${a.id}`} href={`/ops/booking/${a.id}`} onClick={() => setNotifOpen(false)}
                                            className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ borderLeft: '4px solid #b45309', border: '1px solid rgba(146,64,14,0.15)', borderLeftWidth: '4px' }}>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(146,64,14,0.1)', color: '#92400e' }}>Payment Pending</span>
                                                <span className="font-sans text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(5,34,16,0.06)', color: '#475569' }}>{type}</span>
                                            </div>
                                            <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{a.customerName || 'Booking'}</p>
                                            <p className="font-sans text-[11px] text-gray-500 mt-0.5">{a.destination || '—'} · travels {days === 0 ? 'today' : `in ${days}d`}</p>
                                            <p className="font-sans text-[13px] font-black mt-1" style={{ color: '#b45309' }}>Collect ₹{Number(bal).toLocaleString()}</p>
                                        </Link>
                                    )
                                })}

                                {/* Pending token cards */}
                                {pendingTokens.map((t: any) => (
                                    <Link key={`tok-${t.id}`} href="/ops/pending-tokens" onClick={() => setNotifOpen(false)}
                                        className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: '1px solid rgba(8,145,178,0.15)', borderLeft: '4px solid #0891b2' }}>
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: 'rgba(8,145,178,0.1)', color: '#0e7490' }}>Pending Token</span>
                                        <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{t.itinerary?.customerName || 'Token request'}</p>
                                        <p className="font-sans text-[11px] text-gray-500 mt-0.5">{t.itinerary?.destination || '—'} · access token requested</p>
                                    </Link>
                                ))}

                                {/* Assigned handover cards */}
                                {assignedAlerts.map((a: any) => (
                                    <Link key={`asg-${a.id}`} href={`/ops/booking/${a.id}`} onClick={() => setNotifOpen(false)}
                                        className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: '1px solid rgba(6,161,92,0.15)', borderLeft: '4px solid #06a15c' }}>
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: 'rgba(6,161,92,0.1)', color: '#06a15c' }}>New Handover</span>
                                        <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{a.customerName || 'New booking'}</p>
                                        <p className="font-sans text-[11px] text-gray-500 mt-0.5">Handed over by {a.salesName || a.assignedBySalesName || a.createdByName || 'Sales'} · open &amp; acknowledge</p>
                                    </Link>
                                ))}

                                {/* Token decision cards (approved / rejected on my requests) */}
                                {tokenDecisions.map((t: any) => {
                                    const ok = t.status === "approved"
                                    return (
                                        <Link key={`tokdec-${t.id}`} href={`${(userProfile?.role || "").includes("post") ? "/post-ops" : "/ops"}/booking/${t.itineraryId}`} onClick={() => { dismissTokenDecision(t); setNotifOpen(false) }}
                                            className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: `1px solid ${ok ? 'rgba(6,161,92,0.15)' : 'rgba(239,68,68,0.18)'}`, borderLeft: `4px solid ${ok ? '#06a15c' : '#ef4444'}` }}>
                                            <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: ok ? 'rgba(6,161,92,0.1)' : 'rgba(239,68,68,0.1)', color: ok ? '#06a15c' : '#dc2626' }}>Token {ok ? 'Approved' : 'Rejected'}</span>
                                            <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>Your access request was {ok ? 'approved' : 'rejected'}</p>
                                            <p className="font-sans text-[11px] text-gray-500 mt-0.5">{t.approvedByName ? `By ${t.approvedByName}` : ''}{t.reason ? ` · ${t.reason}` : ''}</p>
                                        </Link>
                                    )
                                })}

                                {/* Post-Ops travelling today cards */}
                                {travelingToday.map((a: any) => (
                                    <Link key={`today-${a.id}`} href={`/post-ops/booking/${a.id}`} onClick={() => setNotifOpen(false)}
                                        className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: '1px solid rgba(168,85,247,0.18)', borderLeft: '4px solid #a855f7' }}>
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: 'rgba(168,85,247,0.1)', color: '#7e22ce' }}>Travelling Today</span>
                                        <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{a.customerName || 'Booking'}</p>
                                        <p className="font-sans text-[11px] text-gray-500 mt-0.5">{a.destination || '—'} · departs today — action needed</p>
                                    </Link>
                                ))}

                                {/* Detractor escalation cards (lead) */}
                                {detractorAlerts.map((a: any) => (
                                    <Link key={`det-${a.id}`} href={`/post-ops/booking/${a.id}`} onClick={() => { dismissDetractor(a); setNotifOpen(false) }}
                                        className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444' }}>
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>Detractor — Service Recovery</span>
                                        <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{a.customerName || 'Booking'} · scored {a.feedback?.npsScore}/10</p>
                                        <p className="font-sans text-[11px] text-gray-500 mt-0.5">Call the client within 2 hours — tap to open</p>
                                    </Link>
                                ))}

                                {/* Feedback overdue cards */}
                                {feedbackOverdue.map((a: any) => (
                                    <Link key={`fb-${a.id}`} href={`/post-ops/booking/${a.id}`} onClick={() => setNotifOpen(false)}
                                        className="block rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow" style={{ border: '1px solid rgba(245,158,11,0.2)', borderLeft: '4px solid #f59e0b' }}>
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>Feedback Overdue</span>
                                        <p className="font-sans text-[13px] font-bold" style={{ color: '#052210' }}>{a.customerName || 'Booking'}</p>
                                        <p className="font-sans text-[11px] text-gray-500 mt-0.5">{a.destination || '—'} · NPS not collected within 7 days</p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* The bell button */}
                    <button
                        onClick={() => setNotifOpen(o => !o)}
                        className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                        style={{ background: 'linear-gradient(135deg,#062814,#052210)' }}
                        title="Notifications"
                    >
                        <Bell className="w-6 h-6 text-white" />
                        <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center animate-pulse">{notifTotal}</span>
                    </button>
                </div>
            )}
        </div>
    )
}
