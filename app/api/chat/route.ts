import { NextResponse } from "next/server"
import { DIFFERENTIATORS } from "@/lib/aura/differentiators"
import { retrieveAnchors, findMissingSacredTokens } from "@/lib/aura/style-anchors"

/**
 * Aura AI endpoint — four modes (Aura Build Spec + companion docs):
 *   ask     → SOP-grounded guidance, role-bounded, cited, with booking flags
 *   draft   → tentative itineraries grounded in real inventory (JSON)
 *   compare → honest competitor-quote comparison + USP talking points (JSON)
 *   compose → client-facing message in the matched register (Tanglish/auto)
 *
 * The client builds the ROLE-SCOPED context (lib/ai-context.ts) under the
 * signed-in user's Firestore permissions and sends only that slice here. This
 * route never touches Firestore. The API key stays server-side.
 *
 * Finance figures are stripped client-side for non-admins; we restate the rule
 * in the prompt as defense-in-depth.
 */

const MODEL = "gemini-2.5-flash"

function getApiKey(): string | undefined {
    return (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.NEXT_PUBLIC_GEMINI_API_KEY
    )
}

interface ChatMessage {
    role: "user" | "model"
    text: string
}

async function callGemini(
    apiKey: string,
    systemPrompt: string,
    contents: any[],
    opts: { json?: boolean; maxTokens?: number } = {},
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    const generationConfig: any = {
        temperature: opts.json ? 0.2 : 0.3,
        maxOutputTokens: opts.maxTokens ?? 1500,
        topP: 0.9,
    }
    if (opts.json) generationConfig.responseMimeType = "application/json"

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig }),
    })
    if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.error("Gemini error:", res.status, errText)
        return { ok: false, status: 502, error: `AI service error (${res.status}).` }
    }
    const data: any = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || ""
    return { ok: true, text }
}

function tryParseJson(text: string): any | null {
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        const m = text.match(/\{[\s\S]*\}/)
        if (m) {
            try {
                return JSON.parse(m[0])
            } catch {
                return null
            }
        }
        return null
    }
}

export async function POST(request: Request) {
    try {
        const apiKey = getApiKey()
        if (!apiKey) {
            return NextResponse.json(
                {
                    error:
                        "Aura is not configured yet. Add GEMINI_API_KEY to your environment (.env.local or Cloudflare secret) and restart.",
                },
                { status: 503 },
            )
        }

        const body = await request.json().catch(() => ({}))
        const mode: string = body.mode || "ask"

        // ─────────────────────────── ASK / GUIDANCE ───────────────────────────
        if (mode === "ask") {
            const { question, contextText, role, userName, scopeLabel, phase, financeIncluded, history } = body
            if (!question || !String(question).trim()) {
                return NextResponse.json({ error: "Question is required." }, { status: 400 })
            }

            const systemPrompt = [
                "You are Aura AI, the internal operations assistant for Outbound Travelers' TMS.",
                "You help Sales, Pre-Ops and Post-Ops staff follow our Standard Operating Procedure and answer questions about their own bookings, customers, destinations and pricing.",
                `You are talking to ${userName || "a team member"} — role "${role || "unknown"}", phase "${phase || "?"}".`,
                `Their data access scope: ${scopeLabel || "restricted"}.`,
                "",
                "HARD RULES:",
                '1. Answer ONLY using the KNOWLEDGE below. For an SOP/process question not covered there, reply exactly: "That\'s not covered in our SOP — please check with your team lead." For a data question outside their scope, say you don\'t have it in their accessible data. NEVER use outside knowledge.',
                '2. Always cite the source for process answers, e.g. \'per SOP: "Pre-Ops Handover"\'. Cite the SOP title shown in the KNOWLEDGE.',
                "3. Respect role boundaries (see ROLE BOUNDARY in the KNOWLEDGE). If the user asks to do something the SOP assigns to another role, tell them which role owns it and stop.",
                "4. Be concise and practical — give the NEXT ACTION, not an essay.",
                "5. NEVER invent prices, dates, policies, contacts, bookings, customers, or names. Unknown → say so.",
                "6. If a booking has ⚠ / ℹ flags in the KNOWLEDGE, state them plainly — these are reliable, code-computed facts (e.g. wrong Final Payment Date, ₹NaN DMC cost, below-30% advance, stuck booking).",
                "7. Make NO promises or guarantees of any kind (upgrades, weather, views, 'best price').",
                "8. Aura is READ-ONLY. You advise; you never claim to have changed a booking.",
                financeIncluded
                    ? "9. Finance figures (margins, revenue, payments, balances) ARE available to this admin user — answer using the FINANCE data provided."
                    : "9. FINANCE IS RESTRICTED to admin only. Do NOT reveal margins, profit/revenue, payment ledgers, amounts paid, or balances. If asked, reply: 'Finance figures are restricted to admin access only.' You may state a booking's quoted value if it appears in the KNOWLEDGE.",
                "",
                "Use markdown (short headings, bullets, tables when comparing). Show money in ₹ exactly as given.",
                "",
                "===== KNOWLEDGE (the only data you may use) =====",
                contextText || "(no data available)",
                "===== END KNOWLEDGE =====",
            ].join("\n")

            const contents: any[] = []
            const safeHistory: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : []
            for (const m of safeHistory) {
                if (!m?.text) continue
                contents.push({ role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.text) }] })
            }
            contents.push({ role: "user", parts: [{ text: String(question) }] })

            const r = await callGemini(apiKey, systemPrompt, contents, { maxTokens: 1500 })
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
            return NextResponse.json({ answer: r.text || "I couldn't generate a response. Please rephrase." })
        }

        // ─────────────────────────── DRAFT ITINERARIES ───────────────────────────
        if (mode === "draft") {
            const { inventoryText, draftRequest } = body
            const req = draftRequest || {}
            const count = Math.min(Math.max(Number(req.count) || 3, 1), 5)
            const varyBy = req.vary_by || (req.known?.destination ? "style" : "destination")

            const systemPrompt = [
                "You are Aura in DRAFT mode, creating TENTATIVE sample itineraries for a sales agent live on a call with a prospect.",
                `Produce exactly ${count} itineraries that differ by ${varyBy} (destination | style | budget).`,
                "",
                "RULES:",
                "- Use ONLY destinations, hotels, DMCs and inclusions present in the INVENTORY context below. NEVER invent a place or hotel we do not sell.",
                "- These are tentative. Do NOT give firm prices. Use the indicative band from inventory, or leave indicative_price_band null. Never present a quote.",
                "- No fixed calendar dates. Structure each itinerary as Day 1, Day 2, ... (dates not set yet).",
                "- Make NO promises or guarantees (upgrades, weather, specific views).",
                "- Respect seasonality: if a month is given, do not propose a destination the INVENTORY marks unsuitable for it.",
                "- Match house style: day-wise plan, hotel + transfer cards, relevant hashtags.",
                "- Record any gap you filled (missing destination, budget, dates) in 'assumptions'.",
                '- Return ONLY valid JSON: { "itineraries": [ { "label": string, "destination": string, "duration_days": number, "hashtags": string[], "indicative_price_band": string|null, "tentative": true, "days": [ { "day": number, "title": string, "plan": string, "hotel": {"name":string,"category":string,"meal_plan":string}, "transfers": string[] } ] } ], "assumptions": string[] }',
                "",
                "INVENTORY:",
                inventoryText || "(no inventory available)",
                "",
                "REQUEST:",
                JSON.stringify({ count, vary_by: varyBy, known: req.known || {}, free_text: req.free_text || "" }),
            ].join("\n")

            const contents = [{ role: "user", parts: [{ text: "Generate the draft itineraries now as JSON." }] }]
            let r = await callGemini(apiKey, systemPrompt, contents, { json: true, maxTokens: 4000 })
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
            let parsed = tryParseJson(r.text)
            if (!parsed) {
                // one repair retry
                r = await callGemini(
                    apiKey,
                    systemPrompt,
                    [{ role: "user", parts: [{ text: "Return ONLY the valid JSON object, nothing else." }] }],
                    { json: true, maxTokens: 4000 },
                )
                if (r.ok) parsed = tryParseJson(r.text)
            }
            if (!parsed?.itineraries) {
                return NextResponse.json({ error: "Could not generate valid drafts. Please try again." }, { status: 502 })
            }
            // Guardrail: force tentative + strip stray dates handled in prompt; ensure tentative flag
            parsed.itineraries = (parsed.itineraries || []).map((it: any) => ({ ...it, tentative: true }))
            return NextResponse.json({ draft: parsed })
        }

        // ─────────────────────────── COMPARE QUOTE ───────────────────────────
        if (mode === "compare") {
            const { competitorText, ourContextText } = body
            if (!competitorText || !String(competitorText).trim()) {
                return NextResponse.json({ error: "Paste the competitor's quote text to compare." }, { status: 400 })
            }

            const systemPrompt = [
                "You are Aura in COMPARE mode, helping a sales agent respond when a prospect shares a competitor's cheaper itinerary.",
                "You produce an HONEST, apple-to-apple comparison and evidence-based talking points the agent reads on the call. You never send anything to the client and never change our price.",
                "",
                "You are given OUR side (from our bookings/pricing context), the COMPETITOR quote as raw text (extract it yourself), and our DIFFERENTIATORS.",
                "",
                "RULES:",
                "- First extract the competitor quote into fields (nights, hotel category, meal plan, transfers, sightseeing, taxes, transport, price). Mark anything unclear as a warning and lower confidence — do NOT guess.",
                "- Compare like-for-like: nights, hotel category, meal plan, transfers, sightseeing, transport, taxes — not just total price.",
                "- Explain WHY the competitor is cheaper in terms of concrete exclusions/downgrades you can see (e.g. CP vs MAP, 3-star vs 4-star, no airport transfer, taxes extra, shared vs private).",
                "- Be honest both ways. If the competitor genuinely includes something we don't, say so in 'gaps'. NEVER invent a competitor flaw, price, or detail not in their text.",
                "- Every talking point must be tied to a specific comparison row/gap or a differentiator (set 'based_on'). No generic marketing.",
                "- Make NO promises or guarantees ('best price', 'guaranteed cheapest', upgrades).",
                "- Where the competitor quote is unclear/low-confidence, put it under confirm_with_client as a question, do not assert it.",
                '- Return ONLY valid JSON: { "rows": [{"field":string,"ours":string,"theirs":string,"delta":"ours_better"|"theirs_better"|"same"|"unclear","note":string}], "gaps": string[], "price_gap_explanation": string, "differentiated_summary": string, "usp_talking_points": [{"point":string,"based_on":string}], "confirm_with_client": string[], "confidence": number, "extraction_warnings": string[] }',
                "",
                "OUR SIDE (context):",
                ourContextText || "(use general inclusions; note low confidence on ours if missing)",
                "",
                "DIFFERENTIATORS:",
                JSON.stringify(DIFFERENTIATORS.map((d) => ({ id: d.id, claim: d.claim, evidence_field: d.evidence_field }))),
                "",
                "COMPETITOR QUOTE (raw text):",
                String(competitorText).slice(0, 8000),
            ].join("\n")

            const contents = [{ role: "user", parts: [{ text: "Produce the comparison as JSON now." }] }]
            let r = await callGemini(apiKey, systemPrompt, contents, { json: true, maxTokens: 3000 })
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
            let parsed = tryParseJson(r.text)
            if (!parsed) {
                r = await callGemini(
                    apiKey,
                    systemPrompt,
                    [{ role: "user", parts: [{ text: "Return ONLY the valid JSON object." }] }],
                    { json: true, maxTokens: 3000 },
                )
                if (r.ok) parsed = tryParseJson(r.text)
            }
            if (!parsed?.rows) {
                return NextResponse.json({ error: "Could not parse the comparison. Try cleaner quote text." }, { status: 502 })
            }
            return NextResponse.json({ comparison: parsed })
        }

        // ─────────────────────────── COMPOSE (language layer) ───────────────────────────
        if (mode === "compose") {
            const { intent, clientMessage, target, sourceFacts, scenario } = body
            if (!intent || !String(intent).trim()) {
                return NextResponse.json({ error: "Describe what the message should say (intent)." }, { status: 400 })
            }
            const tgt = target || "auto"
            const anchors = retrieveAnchors(scenario)

            const systemPrompt = [
                "You are Aura composing a CLIENT-FACING message for a travel agent to send. Output ONLY the final message text — no preamble, no quotes, no explanation.",
                "",
                "LANGUAGE & REGISTER:",
                `- Target: ${tgt}. If "auto", detect the register of CLIENT_MESSAGE and reply in the SAME register (English, Tanglish, or Tamil). If unsure, reply in clear English.`,
                "- Tanglish = casual Tamil-English mix in Latin script: warm, respectful, like a helpful local travel agent. Not crude slang, not stiff corporate language.",
                "- Keep ALL prices, amounts (₹), dates, times, booking codes, flight numbers and counts EXACTLY as given, in digits/standard form. NEVER translate or transliterate a number, date, amount, or code.",
                "- Stay professional: no offensive slang, no over-familiarity. One consistent spelling style within the message.",
                "- Make NO promises or guarantees of any kind.",
                "- If a fact is critical (price, payment deadline, booking code), keep it crystal clear.",
                "",
                "STYLE ANCHORS (match this tone):",
                anchors.map((a) => `- [${a.scenario}] ${a.tanglish_example}`).join("\n"),
                "",
                "FACTS THAT MUST APPEAR EXACTLY (do not alter):",
                sourceFacts || "(none provided)",
                "",
                "MESSAGE INTENT (what to convey):",
                String(intent),
                "",
                "CLIENT_MESSAGE (for register mirroring):",
                clientMessage || "(none — default to clear, warm English)",
            ].join("\n")

            const contents = [{ role: "user", parts: [{ text: "Write the client message now." }] }]
            const r = await callGemini(apiKey, systemPrompt, contents, { maxTokens: 800 })
            if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

            // Hard guardrail (Spec §9 #1): numbers/dates/codes must survive intact.
            const source = `${sourceFacts || ""}\n${intent}`
            const missing = findMissingSacredTokens(source, r.text)
            return NextResponse.json({
                message: r.text,
                target: tgt,
                warnings: missing.length ? [`Check these values appear correctly: ${missing.join(", ")}`] : [],
            })
        }

        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 })
    } catch (error: any) {
        console.error("Aura route error:", error)
        return NextResponse.json({ error: error?.message || "Something went wrong." }, { status: 500 })
    }
}
