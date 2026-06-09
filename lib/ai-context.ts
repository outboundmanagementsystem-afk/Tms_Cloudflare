/**
 * Aura AI — role-scoped knowledge context builder.
 *
 * SECURITY MODEL — the heart of Aura's role separation:
 *  - We fetch ONLY the data a given role may see BEFORE anything reaches the
 *    model. The model physically never receives out-of-scope data, so it cannot
 *    leak across roles even under adversarial prompting.
 *  - FINANCE DATA (margins, profit/revenue, payment ledger, amount paid,
 *    balances) is ADMIN/OWNER ONLY — stripped from every other role's context
 *    (finance role included), per business rule.
 *  - Booking SANITY FLAGS (advance %, final-payment-date bug, ₹NaN DMC cost,
 *    stuck bookings, balance SLA) are computed in CODE (lib/aura/sanity.ts) and
 *    injected as reliable facts — never guessed by the model.
 *  - ROLE BOUNDARIES (Aura Spec §7) are injected so the model redirects work
 *    that the SOP assigns to another role.
 *
 * Lanes:
 *   admin/owner   → everything incl. finance
 *   sales_lead    → own + team (leadId) bookings/customers, no finance
 *   sales         → own bookings/customers only, no finance
 *   pre_ops_lead  → team's assigned pre-ops bookings + handover/pre-ops
 *   pre_ops       → own assigned pre-ops bookings
 *   post_ops(_lead) → all post-ops/completed bookings (department-wide)
 *   finance(_lead)  → operational booking view, finance figures BLOCKED
 */

import {
    getUsers,
    getItineraries,
    getCustomers,
    getDestinations,
    getHotels,
    getActivities,
    getTransfers,
    getPackages,
    getSOPs,
} from "./firestore"
import type { UserProfile } from "./auth-context"
import { getSellPrice, getMargin, getRevenue, getAmountPaid, fmt } from "./aura/money"
import { computeBookingFlags } from "./aura/sanity"

// ─── Role groups ────────────────────────────────────────
const ADMIN_ROLES = ["admin", "owner"]
const SALES_LEAD_ROLES = ["sales_lead"]
const SALES_ROLES = ["sales"]
const PRE_OPS_LEAD_ROLES = ["pre_ops_lead", "ops_lead"]
const PRE_OPS_ROLES = ["pre_ops", "ops"]
const POST_OPS_ROLES = ["post_ops", "post_ops_lead"]
const FINANCE_ROLES = ["finance", "finance_lead"]

export function isAdminRole(role: string) {
    return ADMIN_ROLES.includes(role)
}

/** Whether this role may ever see finance figures. Admin/owner only. */
export function canSeeFinance(role: string) {
    return ADMIN_ROLES.includes(role)
}

/** Map an app role to its SOP phase (Aura Spec §7). */
export function rolePhase(role: string): "Sales" | "Pre-Ops" | "Post-Ops" | "Admin" | "Finance" {
    if (ADMIN_ROLES.includes(role)) return "Admin"
    if (SALES_ROLES.includes(role) || SALES_LEAD_ROLES.includes(role)) return "Sales"
    if (PRE_OPS_ROLES.includes(role) || PRE_OPS_LEAD_ROLES.includes(role)) return "Pre-Ops"
    if (POST_OPS_ROLES.includes(role)) return "Post-Ops"
    if (FINANCE_ROLES.includes(role)) return "Finance"
    return "Sales"
}

/** Role boundary text — what this role may advise on and where it must redirect. */
function roleBoundaryText(role: string): string {
    const phase = rolePhase(role)
    switch (phase) {
        case "Sales":
            return "ROLE BOUNDARY — Sales: may advise on itinerary, client promises, advance %, and handover readiness. REDIRECT post-handover edits → reopen via Pre-Ops. Do NOT advise on live driver/cab/guide assignment (Post-Ops owns that)."
        case "Pre-Ops":
            return "ROLE BOUNDARY — Pre-Ops: may advise on the handover checklist, vouchers, DMC booking, the payment rule, and return-to-Sales. REDIRECT live driver / cab / guide questions → Post-Ops. Do NOT change itinerary or pricing (Sales owns that)."
        case "Post-Ops":
            return "ROLE BOUNDARY — Post-Ops: may advise on OPS info, stage checklists, on-tour monitoring, balance collection, and WhatsApp templates. REDIRECT itinerary or pricing changes → back to Sales."
        case "Finance":
            return "ROLE BOUNDARY — Finance: operational visibility only. Detailed finance figures are admin-restricted."
        case "Admin":
        default:
            return "ROLE BOUNDARY — Admin/Owner: full oversight across Sales, Pre-Ops, Post-Ops and Finance."
    }
}

export interface AiContextResult {
    contextText: string
    scopeLabel: string
    financeIncluded: boolean
    phase: string
}

function safe(v: any, fallback = "—"): string {
    if (v === null || v === undefined || v === "") return fallback
    return String(v)
}

// ─── Public: build the scoped Ask/Guidance context ──────
export async function buildAiContext(profile: UserProfile): Promise<AiContextResult> {
    const role = profile.role
    const isAdmin = ADMIN_ROLES.includes(role)
    const isSalesLead = SALES_LEAD_ROLES.includes(role)
    const isSales = SALES_ROLES.includes(role)
    const isPreOpsLead = PRE_OPS_LEAD_ROLES.includes(role)
    const isPreOps = PRE_OPS_ROLES.includes(role)
    const isPostOps = POST_OPS_ROLES.includes(role)
    const isFinance = FINANCE_ROLES.includes(role)
    const showFinance = isAdmin
    const phase = rolePhase(role)
    const today = new Date()

    const [allUsers, allItins] = await Promise.all([
        getUsers().catch(() => [] as any[]),
        getItineraries().catch(() => [] as any[]),
    ])

    const teamMembers = allUsers.filter((u: any) => u.leadId === profile.uid)
    const teamUids = new Set<string>([profile.uid, ...teamMembers.map((m: any) => m.uid)])
    const userName = (uid: string) => {
        const u = allUsers.find((x: any) => x.uid === uid)
        return u?.name || u?.email || uid || "—"
    }

    // ── Scope the bookings this role may see ──
    let scopedItins: any[] = []
    let scopeLabel = ""

    if (isAdmin) {
        scopedItins = allItins
        scopeLabel = "Full access — all bookings, all team members, and finance."
    } else if (isSalesLead) {
        scopedItins = allItins.filter((i: any) => teamUids.has(i.createdBy))
        scopeLabel = "Your own and your sales team's bookings & customers. Finance figures are admin-restricted."
    } else if (isSales) {
        scopedItins = allItins.filter((i: any) => i.createdBy === profile.uid)
        scopeLabel = "Only your own bookings and customers. Finance figures are admin-restricted."
    } else if (isPreOpsLead) {
        scopedItins = allItins.filter(
            (i: any) =>
                teamUids.has(i.assignedPreOpsId) ||
                teamUids.has(i.assignedOps) ||
                ["handover", "pre-ops"].includes(i.status),
        )
        scopeLabel = "Pre-Ops bookings assigned to your team plus all in handover/pre-ops. Finance figures are admin-restricted."
    } else if (isPreOps) {
        scopedItins = allItins.filter(
            (i: any) => i.assignedPreOpsId === profile.uid || i.assignedOps === profile.uid,
        )
        scopeLabel = "Only the Pre-Ops bookings assigned to you. Finance figures are admin-restricted."
    } else if (isPostOps) {
        scopedItins = allItins.filter((i: any) => ["post-ops", "completed"].includes(i.status))
        scopeLabel = "All Post-Ops bookings (post-ops & completed trips). Finance figures are admin-restricted."
    } else if (isFinance) {
        scopedItins = allItins
        scopeLabel = "Operational view of all bookings. Detailed finance figures are admin-only."
    } else {
        scopedItins = []
        scopeLabel = "No data scope configured for your role. Contact your administrator."
    }

    const lines: string[] = []
    lines.push(`# OUTBOUND TRAVELERS — TMS KNOWLEDGE (for ${profile.name}, role: ${role}, phase: ${phase})`)
    lines.push(`Today's date: ${today.toISOString().split("T")[0]}`)
    lines.push(`Access scope: ${scopeLabel}`)
    lines.push(roleBoundaryText(role))
    lines.push("")

    // ── SOPs (with citation tags) — the SOP brain ──
    try {
        let sopDept: string | undefined
        if (isSales || isSalesLead) sopDept = "sales"
        else if (isPreOps || isPreOpsLead) sopDept = "pre_ops"
        else if (isPostOps) sopDept = "post_ops"
        const sops = await getSOPs(isAdmin || isFinance ? undefined : sopDept)
        if (sops.length) {
            lines.push("## SOPs — STANDARD OPERATING PROCEDURES (cite these by title)")
            for (const s of sops as any[]) {
                const items = (s.items || [])
                    .map((it: any) => (typeof it === "object" ? it.title || "" : it))
                    .filter(Boolean)
                lines.push(
                    `### SOP: "${safe(s.title)}" [phase: ${safe(s.department)}${s.stage ? `, stage: ${s.stage}` : ""}]`,
                )
                if (items.length) lines.push(`Steps: ${items.map((t: string, idx: number) => `(${idx + 1}) ${t}`).join("  ")}`)
                if (s.whatsappTemplate) lines.push(`WhatsApp template available for this SOP.`)
            }
            lines.push("")
        }
    } catch {
        /* sops optional */
    }

    // ── Destinations + pricing ──
    try {
        const dests = await getDestinations()
        if (dests.length) {
            lines.push("## DESTINATIONS & PRICING (shared reference)")
            const capped = dests.slice(0, 40)
            for (const d of capped) {
                const dd = d as any
                lines.push(
                    `### ${safe(dd.name)} ${dd.country ? `(${dd.country})` : ""}${dd.currency ? ` — currency ${dd.currency}` : ""}`,
                )
                try {
                    const [hotels, activities, transfers] = await Promise.all([
                        getHotels(dd.id).catch(() => []),
                        getActivities(dd.id).catch(() => []),
                        getTransfers(dd.id).catch(() => []),
                    ])
                    if (hotels.length) {
                        lines.push(
                            "- Hotels: " +
                                (hotels as any[])
                                    .slice(0, 15)
                                    .map(
                                        (x: any) =>
                                            `${x.name}${x.category ? ` [${x.category}]` : ""}${x.rate ? ` ${fmt(x.rate)}/night` : ""}`,
                                    )
                                    .join("; "),
                        )
                    }
                    if (activities.length) {
                        lines.push(
                            "- Activities: " +
                                (activities as any[])
                                    .slice(0, 20)
                                    .map((x: any) => `${x.name}${x.price ? ` ${fmt(x.price)}` : ""}`)
                                    .join("; "),
                        )
                    }
                    if (transfers.length) {
                        lines.push(
                            "- Transfers: " +
                                (transfers as any[])
                                    .slice(0, 15)
                                    .map((x: any) => `${x.type || x.vehicleType || "transfer"}${x.price ? ` ${fmt(x.price)}` : ""}`)
                                    .join("; "),
                        )
                    }
                } catch {
                    /* ignore */
                }
            }
            if (dests.length > capped.length) lines.push(`(…${dests.length - capped.length} more destinations)`)
            lines.push("")
        }
    } catch {
        /* optional */
    }

    // ── Packages ──
    try {
        const pkgs = await getPackages()
        if (pkgs.length) {
            lines.push("## PACKAGES / READY-MADE TEMPLATES (shared reference)")
            for (const p of (pkgs as any[]).slice(0, 60)) {
                lines.push(
                    `- ${safe(p.name)} — ${safe(p.destination)}, ${safe(p.nights, "?")}N/${safe(p.days, "?")}D${
                        p.price ? ` from ${fmt(p.price)}` : ""
                    }`,
                )
            }
            lines.push("")
        }
    } catch {
        /* optional */
    }

    // ── Team roster ──
    if (isAdmin) {
        lines.push("## ALL USERS / STAFF")
        for (const u of allUsers as any[]) {
            lines.push(
                `- ${safe(u.name)} — role: ${safe(u.role)}, code: ${safe(u.employeeCode)}, dept: ${safe(u.department)}${
                    u.leadId ? `, reports to: ${userName(u.leadId)}` : ""
                }`,
            )
        }
        lines.push("")
    } else if (isSalesLead || isPreOpsLead) {
        lines.push("## YOUR TEAM")
        if (teamMembers.length === 0) lines.push("(No team members assigned to you yet.)")
        else for (const u of teamMembers as any[]) lines.push(`- ${safe(u.name)} — role: ${safe(u.role)}, code: ${safe(u.employeeCode)}`)
        lines.push("")
    }

    // ── Customers ──
    try {
        let customers: any[] = []
        if (isAdmin || isFinance) customers = (await getCustomers().catch(() => [])) as any[]
        else if (isSalesLead) {
            const all = (await getCustomers().catch(() => [])) as any[]
            customers = all.filter((c: any) => teamUids.has(c.createdBy))
        } else if (isSales) customers = (await getCustomers(profile.uid).catch(() => [])) as any[]
        else {
            const names = new Set(scopedItins.map((i: any) => i.customerName).filter(Boolean))
            customers = Array.from(names).map((n) => ({ name: n }))
        }
        if (customers.length) {
            lines.push(`## CUSTOMERS (${customers.length})`)
            for (const c of customers.slice(0, 150)) {
                lines.push(
                    `- ${safe(c.name)}${c.phone ? `, ${c.phone}` : ""}${c.email ? `, ${c.email}` : ""}${
                        (isAdmin || isSalesLead) && c.createdBy ? `, owner: ${userName(c.createdBy)}` : ""
                    }`,
                )
            }
            if (customers.length > 150) lines.push(`(…${customers.length - 150} more)`)
            lines.push("")
        }
    } catch {
        /* optional */
    }

    // ── Bookings / Itineraries (with code-computed sanity flags) ──
    lines.push(`## BOOKINGS / ITINERARIES (${scopedItins.length} in your scope)`)
    const byStatus: Record<string, number> = {}
    for (const i of scopedItins) {
        const s = (i as any).status || "draft"
        byStatus[s] = (byStatus[s] || 0) + 1
    }
    lines.push("Pipeline: " + Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", "))

    if (showFinance) {
        const confirmedLike = scopedItins.filter((i: any) =>
            ["confirmed", "handover", "pre-ops", "post-ops", "completed"].includes(i.status),
        )
        const totalRevenue = confirmedLike.reduce((s: number, i: any) => s + getRevenue(i), 0)
        const totalSell = confirmedLike.reduce((s: number, i: any) => s + getSellPrice(i), 0)
        const totalPaid = scopedItins.reduce((s: number, i: any) => s + getAmountPaid(i), 0)
        lines.push(
            `FINANCE (admin-only): confirmed=${confirmedLike.length}, gross sell=${fmt(totalSell)}, est. revenue/profit=${fmt(
                totalRevenue,
            )}, collected=${fmt(totalPaid)}, outstanding=${fmt(totalSell - totalPaid)}`,
        )
    }
    lines.push("")

    const CAP = 160
    const list = scopedItins.slice(0, CAP)
    for (const i of list as any[]) {
        const parts: string[] = []
        parts.push(`[${safe(i.quoteId, i.id?.slice(0, 8))}]`)
        parts.push(`${safe(i.customerName)} → ${safe(i.destination)}`)
        parts.push(`status: ${safe(i.status, "draft")}`)
        if (i.nights || i.days) parts.push(`${safe(i.nights, "?")}N/${safe(i.days, "?")}D`)
        if (i.startDate) parts.push(`travel: ${safe(i.startDate)}→${safe(i.endDate)}`)
        if (i.customerPhone) parts.push(`ph: ${i.customerPhone}`)
        if ((isAdmin || isSalesLead || isPreOpsLead) && i.createdBy) parts.push(`sales: ${i.salesName || userName(i.createdBy)}`)
        if ((isAdmin || isPreOps || isPreOpsLead) && i.assignedPreOpsName) parts.push(`pre-ops: ${i.assignedPreOpsName}`)
        if ((isAdmin || isPostOps) && i.postOpStage) parts.push(`post-ops stage: ${i.postOpStage}`)
        const sell = getSellPrice(i)
        if (sell > 0) parts.push(`value: ${fmt(sell)}`)
        if (showFinance) {
            parts.push(`margin: ${getMargin(i)}%`)
            parts.push(`revenue: ${fmt(getRevenue(i))}`)
            parts.push(`paid: ${fmt(getAmountPaid(i))}`)
            parts.push(`balance: ${fmt(sell - getAmountPaid(i))}`)
        }
        lines.push("- " + parts.join(" · "))

        // Code-computed sanity flags (reliable facts, not model-guessed)
        const { flags } = computeBookingFlags(i, today)
        for (const f of flags) lines.push("    " + f)
    }
    if (scopedItins.length > CAP) {
        lines.push(`(…${scopedItins.length - CAP} more — ask to filter by status, destination, or customer.)`)
    }

    return { contextText: lines.join("\n"), scopeLabel, financeIncluded: showFinance, phase }
}

// ─── Inventory context for DRAFT mode (Aura Draft Spec §6.2) ─────────────
/**
 * Builds the "inventory" Aura may assemble drafts from. Drafts may ONLY use
 * destinations / hotels present here (guardrail #1). Prices are indicative
 * bands, never quotes.
 */
export async function buildInventoryContext(profile: UserProfile): Promise<string> {
    const lines: string[] = []
    lines.push("# INVENTORY (the only destinations, hotels and packages Aura may use in drafts)")
    lines.push(
        "House style: warm, day-wise plan with hotel + transfer cards and relevant hashtags. Prices are INDICATIVE BANDS only — never a firm quote.",
    )
    lines.push("")

    try {
        const dests = await getDestinations()
        for (const d of (dests as any[]).slice(0, 40)) {
            lines.push(`## Destination: ${d.name}${d.country ? ` (${d.country})` : ""}${d.bestMonths ? ` — best months: ${(d.bestMonths || []).join(", ")}` : ""}`)
            try {
                const [hotels, activities] = await Promise.all([
                    getHotels(d.id).catch(() => []),
                    getActivities(d.id).catch(() => []),
                ])
                for (const h of (hotels as any[]).slice(0, 12)) {
                    const meals = h.mealPlans || (h.roomCategories ? ["EP", "CP", "MAP"] : [])
                    lines.push(
                        `- Hotel: ${h.name}${h.category ? ` [${h.category}]` : ""}${
                            meals.length ? ` meal plans: ${(Array.isArray(meals) ? meals : []).join("/")}` : ""
                        }${h.rate ? ` — indicative band ${fmt(Math.round(h.rate * 0.9))}–${fmt(Math.round(h.rate * 1.1))}/night` : ""}`,
                    )
                }
                if ((activities as any[]).length) {
                    lines.push(
                        "  Sightseeing/activities: " +
                            (activities as any[]).slice(0, 15).map((a: any) => a.name).join(", "),
                    )
                }
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* optional */
    }

    try {
        const pkgs = await getPackages()
        if ((pkgs as any[]).length) {
            lines.push("")
            lines.push("## Ready-made packages (templates to base drafts on)")
            for (const p of (pkgs as any[]).slice(0, 60)) {
                lines.push(`- ${p.name} — ${p.destination}, ${p.nights ?? "?"}N/${p.days ?? "?"}D`)
            }
        }
    } catch {
        /* optional */
    }

    return lines.join("\n")
}
