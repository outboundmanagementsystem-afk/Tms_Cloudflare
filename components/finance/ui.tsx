"use client"

import { ReactNode } from "react"
import {
    Search, Handshake, ClipboardList, PlaneTakeoff, Landmark, Smartphone, Banknote,
    BadgeCheck, Clock, AlarmClock, Clock3, type LucideIcon,
} from "lucide-react"
import type { PayStatus, Stage, PayType, Method } from "@/lib/finance/derive"

/* ---------- Status pill ---------- */
export function StatusPill({ status }: { status: PayStatus }) {
    const cls = status === "PAID" ? "pill-paid" : status === "PARTIAL" ? "pill-partial" : "pill-unpaid"
    return (
        <span className={"pill " + cls}>
            <span className="dot" />
            {status}
        </span>
    )
}

/* ---------- Stage / source badge ---------- */
const STAGE_CLASS: Record<string, string> = { "Sales": "stage-Sales", "Pre-Ops": "stage-PreOps", "Post-Ops": "stage-PostOps" }
const STAGE_ICON: Record<string, LucideIcon> = { "Sales": Handshake, "Pre-Ops": ClipboardList, "Post-Ops": PlaneTakeoff }
export function StageBadge({ stage }: { stage: Stage | null | undefined }) {
    if (!stage) return <span style={{ color: "var(--fg3)", fontSize: 12.5 }}>—</span>
    const Ico = STAGE_ICON[stage]
    return (
        <span className={"stage " + (STAGE_CLASS[stage] || "")}>
            {Ico && <Ico />}
            {stage}
        </span>
    )
}

/* ---------- Type pill ---------- */
export function TypePill({ type }: { type: PayType }) {
    return <span className={"type-pill type-" + type}>{type}</span>
}

/* ---------- Verification ---------- */
export function VerifyBadge({ verification }: { verification: "Verified" | "Recorded" }) {
    const Ico = verification === "Verified" ? BadgeCheck : Clock
    return (
        <span className={"verify verify-" + verification}>
            <Ico />
            {verification}
        </span>
    )
}

/* ---------- SLA badge ---------- */
export function SLABadge({ sla }: { sla: { text: string; tone: string; overdue?: boolean } | null }) {
    if (!sla) return null
    const Ico = sla.overdue ? AlarmClock : Clock3
    return (
        <span className={"sla sla-" + sla.tone}>
            <Ico />
            {sla.text}
        </span>
    )
}

/* ---------- Method ---------- */
const METHOD_ICON: Record<string, LucideIcon> = { "Bank Transfer": Landmark, "UPI": Smartphone, "Cash": Banknote }
export function MethodLabel({ method }: { method: Method }) {
    const Ico = METHOD_ICON[method] || Landmark
    return (
        <span className="method">
            <Ico />
            {method}
        </span>
    )
}

/* ---------- Progress bar ---------- */
export function Progress({ pct, tone, mini }: { pct: number; tone?: string; mini?: boolean }) {
    const v = Math.max(0, Math.min(100, pct || 0))
    return (
        <div className={"progress " + (tone || "") + (mini ? " mini" : "")}>
            <span style={{ width: v + "%" }} />
        </div>
    )
}

/* ---------- Metric card ---------- */
const ACCENTS: Record<string, { c: string; bg: string }> = {
    green: { c: "var(--green)", bg: "var(--green-bg)" },
    amber: { c: "var(--amber)", bg: "var(--amber-bg)" },
    red: { c: "var(--red)", bg: "var(--red-bg)" },
    primary: { c: "var(--primary)", bg: "var(--primary-tint)" },
}
export function MetricCard({
    accent, icon: Ico, label, value, foot, count,
}: {
    accent: "green" | "amber" | "red" | "primary"
    icon: LucideIcon
    label: string
    value: string
    foot?: ReactNode
    count?: boolean
}) {
    const c = ACCENTS[accent] || ACCENTS.primary
    return (
        <div className="metric" style={{ ["--accent" as any]: c.c, ["--accent-bg" as any]: c.bg }}>
            <div className="metric-top">
                <div className="metric-ico">
                    <Ico size={19} strokeWidth={2} />
                </div>
                <div className="metric-label">{label}</div>
            </div>
            <div className={"metric-value tnum" + (count ? " count" : "")}>{value}</div>
            {foot ? <div className="metric-foot">{foot}</div> : null}
        </div>
    )
}

/* ---------- Search ---------- */
export function SearchBox({
    value, onChange, placeholder, style,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    style?: React.CSSProperties
}) {
    return (
        <div className="search" style={style}>
            <Search size={17} strokeWidth={2} />
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search…"} />
        </div>
    )
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon: Ico, title, sub, padding }: { icon: LucideIcon; title: string; sub?: string; padding?: string }) {
    return (
        <div className="empty-state" style={padding ? { padding } : undefined}>
            <div className="es-ico">
                <Ico size={26} strokeWidth={1.8} />
            </div>
            <div className="es-title">{title}</div>
            {sub && <div className="es-sub">{sub}</div>}
        </div>
    )
}
