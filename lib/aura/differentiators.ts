/**
 * Differentiators (USP knowledge) — Aura Compare-mode Build Spec §7.3.
 *
 * IMPORTANT: these are HONEST, verifiable strengths only. Aura is forbidden from
 * inventing competitor flaws or making guarantees, so every USP here must be
 * genuinely true for Outbound Travelers. EDIT this seed list to match reality —
 * remove anything you do not always deliver. Each USP is tied to a
 * NormalizedItinerary field so talking points stay grounded in the comparison.
 */

export interface Differentiator {
    id: string
    claim: string // the genuine strength
    evidence_field: string // which NormalizedItinerary field it maps to
    text: string // description (used as model context)
}

export const DIFFERENTIATORS: Differentiator[] = [
    {
        id: "diff_transfers",
        claim: "Airport transfers are included in our packages",
        evidence_field: "transfers_included",
        text: "Our quotes include airport pickup and drop. Many cheaper quotes exclude transfers, which the client pays for separately on arrival.",
    },
    {
        id: "diff_meal_plan",
        claim: "Stronger meal plans (often MAP — breakfast + dinner)",
        evidence_field: "stays.meal_plan",
        text: "We frequently include MAP (breakfast + dinner). A cheaper quote is often EP/CP (room only / breakfast only), so the client pays for meals out of pocket.",
    },
    {
        id: "diff_hotel_category",
        claim: "Verified hotel category, no last-minute downgrades",
        evidence_field: "stays.category",
        text: "We confirm the actual hotel category quoted. Cheaper quotes sometimes show a higher category but deliver a lower one, or leave the hotel 'similar'.",
    },
    {
        id: "diff_taxes",
        claim: "Taxes are included in our quoted price",
        evidence_field: "taxes_included",
        text: "Our price is inclusive of applicable taxes. A 'taxes extra' quote looks cheaper on paper but costs more at payment.",
    },
    {
        id: "diff_support",
        claim: "On-trip support from our Post-Ops team",
        evidence_field: "inclusions",
        text: "We provide active on-tour monitoring and support during the trip, so the client has someone to call if anything goes wrong.",
    },
    {
        id: "diff_private_transport",
        claim: "Private transport / dedicated vehicle where quoted",
        evidence_field: "transport.type",
        text: "Where we quote private transport, the client is not pooled into a shared vehicle. Cheaper quotes often use shared transfers.",
    },
]

/** Retrieve differentiators most relevant to the gaps found in a comparison. */
export function retrieveDifferentiators(relevantFields: string[] = []): Differentiator[] {
    if (relevantFields.length === 0) return DIFFERENTIATORS
    const lowered = relevantFields.map((f) => f.toLowerCase())
    const matched = DIFFERENTIATORS.filter((d) =>
        lowered.some((f) => d.evidence_field.toLowerCase().includes(f) || f.includes(d.evidence_field.toLowerCase())),
    )
    return matched.length ? matched : DIFFERENTIATORS
}
