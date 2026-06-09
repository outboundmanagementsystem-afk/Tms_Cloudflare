/**
 * Finance Register — data + analytics layer.
 *
 * Builds one register row per booking, mostly auto-filled from the TMS:
 *  - AUTO     : status, entry date, team lead, rep, customer, mobile, members,
 *               travel/checkin/checkout, destination, package, total inc-GST, received
 *  - DERIVED  : total cost, GST@5%, adv %, balance, agent fees, balance 2, revenue
 *  - MANUAL   : the 9 fields finance types — persisted as `fin*` fields on the
 *               itinerary doc (one fetch, no N+1 reads; finance/admin can write).
 */

import { getSellPrice } from "@/lib/aura/money"

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const DOMESTIC = new Set([
    "KASHMIR", "GOA", "KERALA", "ANDAMAN", "MANALI", "SHIMLA", "LADAKH", "RAJASTHAN", "OOTY",
    "KODAIKANAL", "PONDICHERRY", "MUNNAR", "COORG", "DARJEELING", "HIMACHAL", "SIKKIM",
    "UTTARAKHAND", "LAKSHADWEEP", "JAIPUR", "AGRA", "VARANASI", "RISHIKESH",
])

export function fmtINR(n: any): string {
    if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—"
    const v = Math.round(Number(n))
    return (v < 0 ? "-₹" : "₹") + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(v))
}

function parseISO(v: any): Date | null {
    if (!v) return null
    const d = new Date(String(v).split("T")[0] + "T00:00:00")
    return isNaN(d.getTime()) ? null : d
}
export function dmy(v: any): string {
    const d = parseISO(v); if (!d) return "—"
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export function monthKey(v: any): string {
    const d = parseISO(v); if (!d) return "—"
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export type FinStatus = "PAID" | "PARTIAL" | "UNPAID" | "NO_PRICE"

export interface RegisterRow {
    id: string
    status: FinStatus
    entryDate: string
    month: string
    type: "Domestic" | "International"
    gstInvNo: string
    teamLead: string
    rep: string
    customer: string
    mobile: string
    city: string
    members: number
    travelMonth: string
    checkin: string
    checkout: string
    destination: string
    pkg: string
    incgst: number
    totalCost: number
    received: number
    advPct: number
    balance: number
    agentGst: number
    agentFees: number
    agentPaid: number
    balance2: number
    gst5: number
    tcs: number
    revenue: number
    revenuePct: number
    dmc: number
    r1: string
    r2: string
    raw: any
}

export const MANUAL_FIELDS = ["finType", "finGstInvNo", "finCity", "finAgentGst", "finAgentPaid", "finTcs", "finDmc", "finR1", "finR2"] as const

function num(v: any): number { return Number(v) || 0 }

export function buildRow(itin: any, usersByUid: Record<string, any>): RegisterRow {
    const incgst = getSellPrice(itin)
    const received = num(itin.amountPaid)
    const total = incgst
    const status: FinStatus = !total ? "NO_PRICE" : received <= 0 ? "UNPAID" : received >= total ? "PAID" : "PARTIAL"
    const totalCost = incgst / 1.05
    const gst5 = incgst - totalCost
    const advPct = incgst > 0 ? Math.round((received / incgst) * 100) : 0
    const balance = Math.max(0, incgst - received)
    const agentGst = num(itin.finAgentGst)
    const agentFees = agentGst / 1.05
    const agentPaid = num(itin.finAgentPaid)
    const balance2 = agentGst - agentPaid
    const dmc = num(itin.finDmc ?? itin.dmcCost)

    const rep = itin.salesName || usersByUid[itin.createdBy]?.name || "—"
    const lead = usersByUid[itin.createdBy]?.leadId
    const teamLead = (lead && usersByUid[lead]?.name) || itin.assignedBySalesName || "—"
    const dest = itin.destination || "—"
    const type: "Domestic" | "International" = itin.finType
        ? itin.finType
        : DOMESTIC.has(String(dest).toUpperCase().trim()) ? "Domestic" : "International"

    // TCS @ 2% — auto for International on the GST-exclusive cost, manual override via finTcs
    const tcs = (itin.finTcs !== undefined && itin.finTcs !== null && itin.finTcs !== "")
        ? num(itin.finTcs)
        : type === "International" ? Math.round(totalCost * 0.02) : 0
    const revenue = totalCost - dmc - agentFees
    // Revenue % off the base excluding GST and TCS
    const revBase = totalCost - tcs
    const revenuePct = revBase > 0 ? Math.round((revenue / revBase) * 100) : 0
    const planName = itin.plans?.find((p: any) => p.planId === itin.selectedPlanId)?.name || itin.plans?.[0]?.name || itin.packageName || dest

    return {
        id: itin.id,
        status,
        entryDate: (itin.createdAt || "").toString().split("T")[0],
        month: monthKey(itin.createdAt),
        type,
        gstInvNo: itin.finGstInvNo || "",
        teamLead,
        rep,
        customer: itin.customerName || "Unnamed",
        mobile: itin.customerPhone || "—",
        city: itin.finCity || itin.customerCity || "",
        members: num(itin.pax?.adults) + num(itin.pax?.children) || num(itin.members) || num(itin.travellers) || 0,
        travelMonth: monthKey(itin.startDate),
        checkin: (itin.startDate || "").toString().split("T")[0],
        checkout: (itin.endDate || "").toString().split("T")[0],
        destination: dest,
        pkg: planName,
        incgst, totalCost, received, advPct, balance,
        agentGst, agentFees, agentPaid, balance2, gst5, tcs, revenue, revenuePct, dmc,
        r1: itin.finR1 || "", r2: itin.finR2 || "",
        raw: itin,
    }
}

export function buildRows(itins: any[], users: any[]): RegisterRow[] {
    const map: Record<string, any> = {}
    for (const u of users) map[u.uid] = u
    return itins.filter((i) => i.status && i.status !== "draft").map((i) => buildRow(i, map))
}

// ── trailing-12-month keys ending at `today` ──
export function trailingMonths(today: Date, count = 12): string[] {
    const out: string[] = []
    let y = today.getFullYear(), m = today.getMonth()
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(y, m - i, 1)
        out.push(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`)
    }
    return out
}

export interface MonthAgg {
    key: string; sales: number; netSales: number; dmc: number; agentFees: number
    revenue: number; collected: number; gst: number; tcs: number; outstanding: number; n: number
}
export function monthlySeries(rows: RegisterRow[], keys: string[]): MonthAgg[] {
    const map: Record<string, MonthAgg> = {}
    for (const k of keys) map[k] = { key: k, sales: 0, netSales: 0, dmc: 0, agentFees: 0, revenue: 0, collected: 0, gst: 0, tcs: 0, outstanding: 0, n: 0 }
    for (const r of rows) {
        const m = map[r.month]; if (!m) continue
        m.sales += r.incgst; m.netSales += r.totalCost; m.dmc += r.dmc; m.agentFees += r.agentFees
        m.revenue += r.revenue; m.collected += r.received; m.gst += r.gst5; m.tcs += r.tcs; m.outstanding += r.balance; m.n++
    }
    return keys.map((k) => map[k])
}

export function sumKey<T>(arr: T[], k: keyof T): number {
    return arr.reduce((s, x) => s + (Number(x[k]) || 0), 0)
}

export interface Totals { sales: number; gst: number; netSales: number; dmc: number; agentFees: number; revenue: number; tcs: number; collected: number; outstanding: number; n: number }
export function totals(rows: RegisterRow[]): Totals {
    return {
        sales: sumKey(rows, "incgst"), gst: sumKey(rows, "gst5"), netSales: sumKey(rows, "totalCost"),
        dmc: sumKey(rows, "dmc"), agentFees: sumKey(rows, "agentFees"), revenue: sumKey(rows, "revenue"),
        tcs: sumKey(rows, "tcs"), collected: sumKey(rows, "received"), outstanding: sumKey(rows, "balance"), n: rows.length,
    }
}

/** Least-squares linear fit; returns predictor at(x). */
export function lsq(ys: number[]) {
    const n = ys.length
    let sx = 0, sy = 0, sxy = 0, sxx = 0
    ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x })
    const d = n * sxx - sx * sx || 1
    const slope = (n * sxy - sx * sy) / d
    const it = (sy - slope * sx) / n
    return { slope, at: (x: number) => slope * x + it }
}

export interface Breakdown { key: string; n: number; sales: number; net: number; dmc: number; tcs: number; revenue: number; margin: number }
export function groupBy(rows: RegisterRow[], keyFn: (r: RegisterRow) => string): Breakdown[] {
    const map: Record<string, Breakdown> = {}
    for (const r of rows) {
        const k = keyFn(r)
        const g = (map[k] = map[k] || { key: k, n: 0, sales: 0, net: 0, dmc: 0, tcs: 0, revenue: 0, margin: 0 })
        g.n++; g.sales += r.incgst; g.net += r.totalCost; g.dmc += r.dmc; g.tcs += r.tcs; g.revenue += r.revenue
    }
    // margin % off the base excluding GST and TCS
    return Object.values(map).map((g) => ({ ...g, margin: (g.net - g.tcs) > 0 ? Math.round((g.revenue / (g.net - g.tcs)) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue)
}

export function aging(rows: RegisterRow[], today: Date) {
    let overdue = 0, soon = 0, upcoming = 0
    for (const r of rows) {
        if (r.balance <= 0) continue
        const ci = parseISO(r.checkin)
        if (!ci) { upcoming += r.balance; continue }
        const due = new Date(ci); due.setDate(due.getDate() - 7)
        const days = Math.round((due.getTime() - today.getTime()) / 86400000)
        if (days < 0) overdue += r.balance
        else if (days <= 7) soon += r.balance
        else upcoming += r.balance
    }
    return { overdue, soon, upcoming }
}
