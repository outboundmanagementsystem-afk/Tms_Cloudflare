/**
 * Tanglish style anchors — Aura Language Layer Build Spec §10.
 *
 * These on-brand examples are the key quality asset for the language layer.
 * EXTEND this with 20–40 real, approved messages from your best agents.
 * Note: prices/amounts/dates/counts stay as digits (₹3,000, 7) — never
 * transliterated. That is a hard guardrail (Spec §9 #1).
 */

export interface StyleAnchor {
    id: string
    scenario: string
    english_intent: string
    tanglish_example: string
}

export const STYLE_ANCHORS: StyleAnchor[] = [
    {
        id: "anchor_followup",
        scenario: "itinerary_followup",
        english_intent: "Following up after sending itinerary options, asking which they prefer.",
        tanglish_example:
            "Hi Sir, neenga sonna Kashmir trip ku 3 options ready pannirukken. Onnu paathutu sollunga edhu pidikuthunu — date confirm aana udane booking start panlam.",
    },
    {
        id: "anchor_advance",
        scenario: "advance_nudge",
        english_intent: "Asking for the advance payment to confirm the booking.",
        tanglish_example:
            "Sir, booking confirm panna ₹3,000 advance podunga. Balance ₹6,775 trip start aagradhuku 7 naal munnadi katti vittaa pothum.",
    },
    {
        id: "anchor_objection_price",
        scenario: "objection_price",
        english_intent: "Handling a 'someone gave cheaper' price objection honestly using inclusions.",
        tanglish_example:
            "Sir andha quote la breakfast mattum than (CP). Namma package la breakfast + dinner rendum included (MAP), plus airport pickup free. Adhanaala konja price difference, aana value-ku namma deal nalladhu.",
    },
    {
        id: "anchor_reassurance",
        scenario: "reassurance",
        english_intent: "Reassuring the client that the team supports them through the trip.",
        tanglish_example:
            "Kavalai padaadhinga Sir, trip full-a namma team support pannum. Edhuvuna doubt iruntha direct-a call pannunga.",
    },
]

export function retrieveAnchors(scenario?: string): StyleAnchor[] {
    if (!scenario) return STYLE_ANCHORS
    const matched = STYLE_ANCHORS.filter((a) => a.scenario === scenario)
    return matched.length ? matched : STYLE_ANCHORS
}

/**
 * Hard guardrail (Spec §9 #1): every ₹ amount, date, time, booking code and
 * flight number present in the source must appear unchanged in the output.
 * Returns the list of source tokens missing from the output (empty = OK).
 */
export function findMissingSacredTokens(source: string, output: string): string[] {
    const patterns: RegExp[] = [
        /(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d+)?/gi, // amounts: ₹3,000 / Rs6775 / INR 500
        /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
        /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, // dd/mm/yyyy style dates
        /\b\d{1,2}:\d{2}\s?(?:am|pm)?\b/gi, // times
        /\b[A-Z]{2,6}\d{2,}\b/g, // codes: OTKA0161, EK505
    ]
    // Compare on the digit-core so formatting (₹, commas, spaces) doesn't cause
    // false positives, while still catching genuinely dropped/altered values.
    const core = (s: string) => s.replace(/[^0-9]/g, "")
    const outDigits = core(output)
    const seen = new Set<string>()
    const missing: string[] = []
    for (const re of patterns) {
        const m = source.match(re)
        if (!m) continue
        for (const tok of m) {
            const c = core(tok)
            if (!c || seen.has(c)) continue
            seen.add(c)
            if (!outDigits.includes(c)) missing.push(tok.trim())
        }
    }
    return missing
}
