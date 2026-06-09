// Weighted per-passenger pricing.
//
// The old model split the group total 85% adults / 15% children — a percentage of the
// *total*, which drifts with headcount and can make a child cost more than an adult.
//
// This model instead weights each passenger relative to one adult (set once in admin
// Settings) and distributes the fixed sell total across those weighted units:
//
//     W = Σ (count × weight)
//     per-head(type) = SellTotal × (weight ÷ W)
//
// A child is then always a fixed fraction of an adult at ANY group size, and the split
// always reconciles back to SellTotal. Infants (< 5) carry weight 0 → complimentary.

export type PaxWeights = {
  adult: number
  childWithBed: number
  childNoBed: number
  infant: number
}

// Defaults chosen with the user for Indian outbound. Adult is always 1.00.
export const DEFAULT_WEIGHTS: PaxWeights = {
  adult: 1,
  childWithBed: 0.5,
  childNoBed: 0.25,
  infant: 0, // under-5 is complimentary
}

export type PaxComposition = {
  adults: number
  childrenWithBed: number
  childrenNoBed: number
  infants: number
}

export type ChildClass = "adult" | "childWithBed" | "childNoBed" | "infant"

/** Parse an age string into years. "12 months" / "12 mo" → 1 year; "6", "6 yrs" → 6. */
export function parseAgeYears(ageStr: string): number | null {
  if (!ageStr) return null
  const lower = ageStr.toLowerCase()
  const m = lower.match(/\d+(\.\d+)?/)
  if (!m) return null
  let years = parseFloat(m[0])
  const isMonths = /month|\bmos?\b/.test(lower) && !/year|yr/.test(lower)
  if (isMonths) years = years / 12
  return years
}

/**
 * Classify one child for pricing:
 *  - under 5            → infant (complimentary)
 *  - over 12            → counted as an adult
 *  - 5–12               → child, using the chosen bed type
 *  - unknown age        → child, using the chosen bed type (safest non-free default)
 */
export function classifyChild(ageStr: string, bedType: "with" | "without"): ChildClass {
  const years = parseAgeYears(ageStr)
  if (years !== null) {
    if (years < 5) return "infant"
    if (years > 12) return "adult"
  }
  return bedType === "without" ? "childNoBed" : "childWithBed"
}

/** Roll the trip-step inputs up into a head-count composition. */
export function buildComposition(
  adults: number,
  childAges: string[],
  childBedTypes: string[],
  childrenCount: number,
): PaxComposition {
  let a = adults || 0
  let cwb = 0, cnb = 0, inf = 0
  for (let i = 0; i < (childrenCount || 0); i++) {
    const cls = classifyChild(childAges[i] || "", (childBedTypes[i] as "with" | "without") || "with")
    if (cls === "adult") a++
    else if (cls === "childWithBed") cwb++
    else if (cls === "childNoBed") cnb++
    else inf++
  }
  return { adults: a, childrenWithBed: cwb, childrenNoBed: cnb, infants: inf }
}

export type WeightedSplit = {
  perAdult: number
  perChildWithBed: number
  perChildNoBed: number
  perInfant: number
  weightedUnits: number
}

/**
 * Distribute `total` across the composition by weight. Children/infants are rounded, and
 * adults absorb the rounding remainder so Σ(count × per-head) === total (no rupee leak).
 */
export function computeWeightedSplit(
  total: number,
  comp: PaxComposition,
  weights: PaxWeights = DEFAULT_WEIGHTS,
): WeightedSplit {
  const W =
    comp.adults * weights.adult +
    comp.childrenWithBed * weights.childWithBed +
    comp.childrenNoBed * weights.childNoBed +
    comp.infants * weights.infant

  if (W <= 0 || total <= 0) {
    return { perAdult: 0, perChildWithBed: 0, perChildNoBed: 0, perInfant: 0, weightedUnits: W }
  }

  const perChildWithBed = Math.round((total * weights.childWithBed) / W)
  const perChildNoBed = Math.round((total * weights.childNoBed) / W)
  const perInfant = Math.round((total * weights.infant) / W)

  const consumed =
    perChildWithBed * comp.childrenWithBed +
    perChildNoBed * comp.childrenNoBed +
    perInfant * comp.infants

  const perAdult = comp.adults > 0
    ? Math.round((total - consumed) / comp.adults)
    : Math.round((total * weights.adult) / W)

  return { perAdult, perChildWithBed, perChildNoBed, perInfant, weightedUnits: W }
}
