/**
 * Finance derivation layer.
 *
 * Mirrors the finance reference's data model (one payments ledger is the source
 * of truth; collected/balance/status/SLA are always DERIVED) but maps it onto
 * our real Firestore itinerary + payments shape.
 */

import { getSellPrice } from "@/lib/aura/money"

export type PayStatus = "PAID" | "PARTIAL" | "UNPAID"
export type Stage = "Sales" | "Pre-Ops" | "Post-Ops"
export type PayType = "ADVANCE" | "BALANCE" | "FULL"
export type Method = "Bank Transfer" | "UPI" | "Cash"

export interface DerivedPayment {
    date: string
    amount: number
    method: Method
    stage: Stage | null
    collectedBy: string
    verification: "Verified" | "Recorded"
    type: PayType
    evidence?: string
}

export interface DerivedBooking {
    id: string
    code: string
    client: { title: string; name: string; email: string; phone: string }
    destination: string
    country: string
    duration: string
    travelDate: string
    balanceDueDate: string
    total: number
    collected: number
    balance: number
    percent: number
    status: PayStatus
    latestStage: Stage | null
    sla: { text: string; tone: "red" | "amber" | "neutral"; overdue?: boolean } | null
    payments: DerivedPayment[]
    raw: any
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function fmtINR(n: any): string {
    if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—"
    const v = Math.round(Number(n))
    const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(v))
    return (v < 0 ? "-₹" : "₹") + grouped
}

function parseISO(v: any): Date | null {
    if (!v) return null
    const d = new Date(String(v).split("T")[0] + "T00:00:00")
    return isNaN(d.getTime()) ? null : d
}

export function fmtDate(iso: any): string {
    const d = parseISO(iso)
    if (!d) return "—"
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateShort(iso: any): string {
    const d = parseISO(iso)
    if (!d) return "—"
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ── method / type mapping (our lowercase ↔ reference labels) ──
export function methodLabel(m: any): Method {
    const s = String(m || "").toLowerCase()
    if (s === "bank_transfer" || s === "bank transfer") return "Bank Transfer"
    if (s === "upi") return "UPI"
    if (s === "cash") return "Cash"
    return "Bank Transfer"
}
export function methodValue(label: string): "bank_transfer" | "upi" | "cash" {
    if (label === "UPI") return "upi"
    if (label === "Cash") return "cash"
    return "bank_transfer"
}
export function typeLabel(t: any): PayType {
    const s = String(t || "").toLowerCase()
    if (s === "full") return "FULL"
    if (s === "balance") return "BALANCE"
    return "ADVANCE"
}
export function typeValue(label: string): "advance" | "balance" | "full" {
    if (label === "FULL") return "full"
    if (label === "BALANCE") return "balance"
    return "advance"
}

function normalizeStage(s: any): Stage | null {
    const v = String(s || "").toLowerCase().replace(/[\s_-]/g, "")
    if (v === "sales") return "Sales"
    if (v === "preops") return "Pre-Ops"
    if (v === "postops") return "Post-Ops"
    return null
}

export function evidenceName(p: any): string {
    const url = p.screenshotUrl || (p.screenshotUrls && p.screenshotUrls[0]) || ""
    if (!url) return "—"
    const parts = String(url).split("/")
    return decodeURIComponent(parts[parts.length - 1] || "screenshot")
}

/** Map one Firestore payment doc → DerivedPayment. */
export function mapPayment(p: any): DerivedPayment {
    return {
        date: (p.collectedAt || p.createdAt || "").toString().split("T")[0],
        amount: Number(p.amount) || 0,
        method: methodLabel(p.method),
        stage: normalizeStage(p.stage),
        collectedBy: p.collectedByName || p.collectedBy || "—",
        verification: p.verification === "Verified" ? "Verified" : "Recorded",
        type: typeLabel(p.type),
        evidence: evidenceName(p),
    }
}

function statusOf(total: number, collected: number): PayStatus {
    if (collected <= 0) return "UNPAID"
    if (total > 0 && collected >= total) return "PAID"
    return "PARTIAL"
}

function dueDateOf(itin: any): string {
    // Prefer a stored final-payment date; else SOP rule arrival − 7.
    const stored = itin.finalPaymentDate || itin.finalPaymentDueDate || itin.balanceDueDate
    if (stored) return String(stored).split("T")[0]
    const arrival = parseISO(itin.startDate || itin.arrivalDate)
    if (!arrival) return ""
    const due = new Date(arrival)
    due.setDate(due.getDate() - 7)
    return due.toISOString().split("T")[0]
}

function slaOf(dueISO: string, balance: number, today: Date) {
    if (balance <= 0) return null
    const due = parseISO(dueISO)
    if (!due) return null
    const diff = daysBetween(today, due) // >0 = future
    if (diff < 0) return { text: `Overdue by ${Math.abs(diff)}d`, tone: "red" as const, overdue: true }
    if (diff === 0) return { text: "Due today", tone: "amber" as const }
    if (diff === 1) return { text: "Due by Day 1", tone: "amber" as const }
    if (diff <= 7) return { text: `Due in ${diff}d`, tone: "amber" as const }
    return { text: `Due ${fmtDateShort(dueISO)}`, tone: "neutral" as const }
}

/**
 * Derive a booking. `payments` (mapped) optional — when omitted, `collected`
 * falls back to the itinerary's stored `amountPaid` (fast path for lists).
 */
export function deriveBooking(itin: any, payments?: DerivedPayment[], today: Date = new Date()): DerivedBooking {
    const total = getSellPrice(itin)
    const collected = payments
        ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        : Number(itin.amountPaid) || 0
    const balance = Math.max(0, total - collected)
    const percent = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0
    const status = statusOf(total, collected)
    const dueISO = dueDateOf(itin)

    let latestStage: Stage | null = null
    if (payments && payments.length) {
        const sorted = [...payments].sort((a, b) => +new Date(b.date) - +new Date(a.date))
        latestStage = sorted[0].stage
    }

    return {
        id: itin.id,
        code: itin.quoteId || (itin.id ? itin.id.slice(0, 8).toUpperCase() : "—"),
        client: {
            title: itin.customerTitle || "",
            name: itin.customerName || "Unnamed",
            email: itin.customerEmail || "—",
            phone: itin.customerPhone || "—",
        },
        destination: itin.destination || "—",
        country: itin.country || "",
        duration: itin.nights || itin.days ? `${itin.nights ?? "?"}N/${itin.days ?? "?"}D` : "—",
        travelDate: (itin.startDate || "").toString().split("T")[0],
        balanceDueDate: dueISO,
        total,
        collected,
        balance,
        percent,
        status,
        latestStage,
        sla: slaOf(dueISO, balance, today),
        payments: payments || [],
        raw: itin,
    }
}

export interface PortfolioTotals {
    value: number; collected: number; balance: number; paid: number; partial: number; unpaid: number
}
export function totals(list: DerivedBooking[]): PortfolioTotals {
    const t: PortfolioTotals = { value: 0, collected: 0, balance: 0, paid: 0, partial: 0, unpaid: 0 }
    for (const b of list) {
        t.value += b.total; t.collected += b.collected; t.balance += b.balance
        if (b.status === "PAID") t.paid++
        else if (b.status === "PARTIAL") t.partial++
        else t.unpaid++
    }
    return t
}

// ── Invoices: one row per payment event ──
export function invNumber(code: string, seq: number): string {
    let digits = (String(code).match(/\d+/) || ["0"])[0]
    while (digits.length < 6) digits = "0" + digits
    let s = String(seq)
    while (s.length < 3) s = "0" + s
    return `INV-${digits}-${s}`
}

export interface InvoiceRow extends DerivedPayment {
    invId: string
    bookingId: string
    code: string
    client: DerivedBooking["client"]
    destination: string
    country: string
    duration: string
    travelDate: string
    packageTotal: number
    collectedToDate: number
}

/** Build invoice rows from itineraries that carry a `.payments` array (getAllPayments). */
export function buildInvoices(itinsWithPayments: any[], today: Date = new Date()): InvoiceRow[] {
    const rows: InvoiceRow[] = []
    for (const itin of itinsWithPayments) {
        const mapped = (itin.payments || []).map(mapPayment)
        const d = deriveBooking(itin, mapped, today)
        // chronological order to assign stable sequence numbers
        const chrono = [...mapped].sort((a, b) => +new Date(a.date) - +new Date(b.date))
        chrono.forEach((p, i) => {
            rows.push({
                ...p,
                invId: invNumber(d.code, i + 1),
                bookingId: d.id,
                code: d.code,
                client: d.client,
                destination: d.destination,
                country: d.country,
                duration: d.duration,
                travelDate: d.travelDate,
                packageTotal: d.total,
                collectedToDate: d.collected,
            })
        })
    }
    rows.sort((a, b) => +new Date(b.date) - +new Date(a.date))
    return rows
}
