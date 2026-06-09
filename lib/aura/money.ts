/**
 * Shared money helpers for Aura. Kept separate so both the context builder and
 * the sanity-check engine can use them without a circular import.
 *
 * Revenue/profit = sell * margin/(100+margin). These figures are FINANCE data
 * and must only ever be surfaced to admin/owner (see lib/ai-context.ts).
 */

// Single source of truth for a booking's sell price. Priority:
//   1. an upsell/downsell revised total (if recorded)
//   2. the selected plan's total from itinerary.plans (canonical store)
//   3. legacy doc-level fallbacks
export function getSellPrice(i: any): number {
    if (i?.upsell?.totalAmount != null && i.upsell.totalAmount !== "") {
        return Number(i.upsell.totalAmount) || 0
    }
    const plans: any[] = Array.isArray(i?.plans) ? i.plans : []
    const sel = plans.find((p: any) => (p.planId ?? p.id) === i?.selectedPlanId) ?? plans[0]
    const fromPlan = sel ? (sel.overrideTotal ?? sel.totalPrice ?? sel.total) : undefined
    return Number(fromPlan ?? i?.totalPrice ?? i?.sellPrice ?? 0) || 0
}

export function getMargin(i: any): number {
    return Number(i?.margin) || 15
}

export function getRevenue(i: any): number {
    const total = getSellPrice(i)
    const m = getMargin(i)
    return Math.round(total * (m / (100 + m)))
}

export function getAmountPaid(i: any): number {
    return Number(i?.amountPaid) || 0
}

export function fmt(n: number): string {
    return "₹" + (Number(n) || 0).toLocaleString("en-IN")
}
