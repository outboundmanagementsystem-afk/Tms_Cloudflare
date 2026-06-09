// Domestic vs International classification + balance-payment reminder windows.
// Mirrors the finance register's logic so a booking is typed the same everywhere.

const DOMESTIC = new Set([
  "KASHMIR", "GOA", "KERALA", "ANDAMAN", "MANALI", "SHIMLA", "LADAKH", "RAJASTHAN", "OOTY",
  "KODAIKANAL", "PONDICHERRY", "MUNNAR", "COORG", "DARJEELING", "HIMACHAL", "SIKKIM",
  "UTTARAKHAND", "LAKSHADWEEP", "JAIPUR", "AGRA", "VARANASI", "RISHIKESH",
])

export type TripType = "Domestic" | "International"

export function getTripType(itin: any): TripType {
  if (itin?.finType === "Domestic" || itin?.finType === "International") return itin.finType
  const dest = String(itin?.destination || "").toUpperCase().trim()
  return DOMESTIC.has(dest) ? "Domestic" : "International"
}

// Pre-Ops must chase the balance payment this many days before travel.
// Domestic: 3 days before. International: 15 days before.
export function balanceReminderDays(type: TripType): number {
  return type === "Domestic" ? 3 : 15
}

/** Whole days from today (local midnight) until the trip start date. Negative = already started. */
export function daysUntil(startDate: any): number | null {
  if (!startDate) return null
  const d = new Date(String(startDate).split("T")[0] + "T00:00:00")
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

// ─── DMC-based pricing (per the senior's spec) ──────────────────────────────
// The salesperson enters only the DMC quote per option; margin + GST + TCS are
// auto-applied based on the destination's pricing profile.

export const GST_RATE = 0.05
export const TCS_RATE = 0.02

export type PricingProfileKey = "domestic" | "international" | "maldives"

export const PRICING_PROFILES: Record<PricingProfileKey, { label: string; margin: number | "tiered"; gst: number; tcs: number }> = {
  domestic: { label: "Domestic (India)", margin: "tiered", gst: GST_RATE, tcs: 0 },
  international: { label: "International", margin: 23, gst: GST_RATE, tcs: TCS_RATE },
  maldives: { label: "Maldives", margin: 10, gst: GST_RATE, tcs: TCS_RATE },
}

/** Resolve a destination to a pricing profile key.
 *  1) explicit `pricingProfile` field wins (e.g. Maldives)
 *  2) name "Maldives" → maldives  3) country India OR a known domestic name → domestic
 *  4) everything else → international. */
export function resolveProfileKey(dest: any): PricingProfileKey {
  if (dest?.pricingProfile && PRICING_PROFILES[dest.pricingProfile as PricingProfileKey]) {
    return dest.pricingProfile as PricingProfileKey
  }
  const name = String(dest?.name || dest?.destination || "").trim()
  if (name.toLowerCase() === "maldives") return "maldives"
  const country = String(dest?.country || "").trim().toLowerCase()
  if (country === "india") return "domestic"
  if (DOMESTIC.has(name.toUpperCase())) return "domestic"
  if (country) return "international" // a non-India country is set → international
  // No country info at all: fall back to the domestic name list, else international.
  return DOMESTIC.has(name.toUpperCase()) ? "domestic" : "international"
}

/** Domestic margin by TOTAL DMC cost (bands are [lower, upper)). */
export function domesticMargin(dmc: number): number {
  if (dmc >= 25000) return 23
  if (dmc >= 20000) return 30
  if (dmc >= 15000) return 35
  return 35 // < 15,000 — default (confirm rule)
}

export type DmcPricing = {
  profileKey: PricingProfileKey
  profileLabel: string
  marginPct: number
  profitAmount: number
  packageValue: number
  gst: number
  tcs: number
  grandTotal: number
}

/** Compute the full DMC-based price for one option. */
export function calcDmcPricing(dmcInput: any, dest: any): DmcPricing {
  const dmc = Math.max(0, Number(dmcInput) || 0)
  const key = resolveProfileKey(dest)
  const profile = PRICING_PROFILES[key]
  const marginPct = profile.margin === "tiered" ? domesticMargin(dmc) : profile.margin
  const profitAmount = Math.round(dmc * (marginPct / 100))
  const packageValue = dmc + profitAmount
  const gst = Math.round(packageValue * profile.gst)
  const tcs = Math.round(packageValue * profile.tcs)
  const grandTotal = packageValue + gst + tcs
  return { profileKey: key, profileLabel: profile.label, marginPct, profitAmount, packageValue, gst, tcs, grandTotal }
}

/** Outstanding balance on a booking = sell price − amount paid. */
export function balanceDue(itin: any): number {
  const plan = itin?.plans?.find((p: any) => p.planId === itin.selectedPlanId) || itin?.plans?.[0]
  const sell = Number(plan?.totalPrice ?? itin?.totalPrice ?? itin?.sellPrice ?? 0) || 0
  const paid = Number(itin?.amountPaid ?? 0) || 0
  return sell - paid
}
