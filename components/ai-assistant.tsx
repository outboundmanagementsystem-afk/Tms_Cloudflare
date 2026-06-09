"use client"

import { useState, useRef, useEffect, useCallback, ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { buildAiContext, buildInventoryContext, rolePhase, type AiContextResult } from "@/lib/ai-context"
import {
    Sparkles, Send, X, Bot, User as UserIcon, RefreshCw, Loader2, ShieldCheck,
    MessageSquare, Wand2, Scale, Languages, Copy, Check, AlertTriangle, MapPin, Calendar, Hotel,
} from "lucide-react"

type Mode = "ask" | "draft" | "compare" | "compose"

interface Msg {
    role: "user" | "model"
    text: string
}

// ─── Role-aware suggested prompts (Ask mode) ────────────
function getSuggestions(role: string): string[] {
    const phase = rolePhase(role)
    if (phase === "Admin") {
        return [
            "What's our total revenue and outstanding balance?",
            "Which bookings have ⚠ flags right now?",
            "What's the advance payment rule?",
            "Show all confirmed bookings to Dubai",
        ]
    }
    if (phase === "Sales") {
        return [
            "What's the advance payment rule?",
            "Which of my leads need follow-up?",
            "What's my next step on this booking?",
            "What activities are available in Bali?",
        ]
    }
    if (phase === "Pre-Ops") {
        return [
            "What are the Pre-Ops checklist steps?",
            "Which bookings are assigned to me?",
            "What happens when a bridge fails?",
            "When is the final payment due?",
        ]
    }
    if (phase === "Post-Ops") {
        return [
            "What are the Post-Ops stage checklists?",
            "Which trips are in post-ops now?",
            "What's the balance collection rule?",
            "Show WhatsApp templates",
        ]
    }
    return ["What can you help me with?", "What's the advance payment rule?"]
}

// ─── Tiny markdown renderer ─────────────────────────────
function renderMarkdown(text: string): ReactNode {
    const lines = (text || "").split("\n")
    const out: ReactNode[] = []
    let listBuf: string[] = []
    const flush = (key: string) => {
        if (!listBuf.length) return
        out.push(
            <ul key={key} className="list-disc pl-5 space-y-1 my-1.5">
                {listBuf.map((li, i) => (
                    <li key={i}>{inline(li)}</li>
                ))}
            </ul>,
        )
        listBuf = []
    }
    const inline = (s: string): ReactNode => {
        const parts = s.split(/(\*\*[^*]+\*\*)/g)
        return parts.map((p, i) =>
            p.startsWith("**") && p.endsWith("**") ? (
                <strong key={i} style={{ color: "#052210" }}>
                    {p.slice(2, -2)}
                </strong>
            ) : (
                <span key={i}>{p}</span>
            ),
        )
    }
    lines.forEach((raw, idx) => {
        const line = raw.trimEnd()
        if (/^#{1,6}\s/.test(line)) {
            flush(`l${idx}`)
            out.push(
                <p key={idx} className="font-serif font-bold mt-2 mb-1" style={{ color: "#052210" }}>
                    {inline(line.replace(/^#{1,6}\s/, ""))}
                </p>,
            )
        } else if (/^[-*]\s/.test(line)) listBuf.push(line.replace(/^[-*]\s/, ""))
        else if (line === "") flush(`l${idx}`)
        else {
            flush(`l${idx}`)
            out.push(
                <p key={idx} className="my-1">
                    {inline(line)}
                </p>,
            )
        }
    })
    flush("last")
    return out
}

// ─── Small UI helpers ───────────────────────────────────
const inputStyle = {
    border: "1px solid rgba(5,34,16,0.12)",
    color: "#052210",
    background: "#FFFFFF",
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="font-sans text-[11px] font-semibold tracking-wide uppercase" style={{ color: "rgba(5,34,16,0.55)" }}>
                {label}
            </span>
            <div className="mt-1">{children}</div>
        </label>
    )
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            onClick={() => {
                navigator.clipboard?.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-sans text-[11px] transition-colors"
            style={{ border: "1px solid rgba(5,34,16,0.12)", color: "#06a15c" }}
        >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
        </button>
    )
}

function PrimaryButton({ onClick, disabled, loading, children }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-sans text-sm font-semibold transition-all disabled:opacity-40 hover:scale-[1.02]"
            style={{ background: "#06a15c", color: "#FFFFFF" }}
        >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {children}
        </button>
    )
}

function ErrorBox({ msg }: { msg: string }) {
    if (!msg) return null
    return (
        <div className="rounded-xl px-3.5 py-2.5 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <span className="font-sans text-xs" style={{ color: "#b91c1c" }}>{msg}</span>
        </div>
    )
}

// ════════════════════════ ASK MODE ════════════════════════
function AskPanel({ getCtx }: { getCtx: (force?: boolean) => Promise<AiContextResult | null> }) {
    const { userProfile } = useAuth()
    const [messages, setMessages] = useState<Msg[]>([])
    const [input, setInput] = useState("")
    const [sending, setSending] = useState(false)
    const [status, setStatus] = useState<"idle" | "building" | "thinking">("idle")
    const scrollRef = useRef<HTMLDivElement>(null)
    const suggestions = userProfile ? getSuggestions(userProfile.role) : []

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }, [messages, sending])

    const send = useCallback(
        async (q: string) => {
            const question = q.trim()
            if (!question || sending || !userProfile) return
            setInput("")
            const history = messages.slice(-10)
            setMessages((m) => [...m, { role: "user", text: question }])
            setSending(true)
            setStatus("building")
            try {
                const ctx = await getCtx()
                if (!ctx) {
                    setMessages((m) => [...m, { role: "model", text: "I couldn't load your data. Try the refresh button or reload." }])
                    return
                }
                setStatus("thinking")
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode: "ask",
                        question,
                        contextText: ctx.contextText,
                        role: userProfile.role,
                        userName: userProfile.name,
                        scopeLabel: ctx.scopeLabel,
                        phase: ctx.phase,
                        financeIncluded: ctx.financeIncluded,
                        history,
                    }),
                })
                const data = await res.json()
                setMessages((m) => [...m, { role: "model", text: res.ok ? data.answer : `⚠️ ${data.error || "Something went wrong."}` }])
            } catch (e: any) {
                setMessages((m) => [...m, { role: "model", text: `⚠️ ${e?.message || "Network error."}` }])
            } finally {
                setSending(false)
                setStatus("idle")
            }
        },
        [messages, sending, userProfile, getCtx],
    )

    return (
        <div className="flex flex-col h-full">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center text-center pt-4">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-4" style={{ background: "rgba(6,161,92,0.08)" }}>
                            <ShieldCheck className="w-3 h-3" style={{ color: "#06a15c" }} />
                            <span className="font-sans text-[10px]" style={{ color: "#06a15c" }}>
                                SOP-grounded · scoped to {userProfile?.role}
                            </span>
                        </div>
                        <p className="font-sans text-xs max-w-xs mb-4" style={{ color: "rgba(5,34,16,0.5)" }}>
                            Ask about your bookings, the SOP, pricing, or your next step. Aura answers only from your data and cites the SOP.
                        </p>
                        <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                            {suggestions.map((s) => (
                                <button key={s} onClick={() => send(s)} className="text-left px-3.5 py-2.5 rounded-xl font-sans text-xs transition-all hover:-translate-y-0.5" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.08)", color: "#052210" }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: m.role === "user" ? "rgba(5,34,16,0.08)" : "rgba(6,161,92,0.12)" }}>
                            {m.role === "user" ? <UserIcon className="w-3.5 h-3.5" style={{ color: "#052210" }} /> : <Bot className="w-3.5 h-3.5" style={{ color: "#06a15c" }} />}
                        </div>
                        <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 font-sans text-[13px] leading-relaxed ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`} style={{ background: m.role === "user" ? "#052210" : "#FFFFFF", color: m.role === "user" ? "#FFFFFF" : "rgba(5,34,16,0.85)", border: m.role === "user" ? "none" : "1px solid rgba(5,34,16,0.07)" }}>
                            {m.role === "user" ? m.text : <div>{renderMarkdown(m.text)}</div>}
                        </div>
                    </div>
                ))}
                {sending && (
                    <div className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,161,92,0.12)" }}>
                            <Bot className="w-3.5 h-3.5" style={{ color: "#06a15c" }} />
                        </div>
                        <div className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.07)" }}>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#06a15c" }} />
                            <span className="font-sans text-xs" style={{ color: "rgba(5,34,16,0.5)" }}>{status === "building" ? "Reading your data…" : "Thinking…"}</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 p-3" style={{ borderTop: "1px solid rgba(5,34,16,0.07)", background: "#FFFFFF" }}>
                <div className="flex items-end gap-2">
                    <button onClick={() => getCtx(true)} title="Refresh data" className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100" style={{ border: "1px solid rgba(5,34,16,0.1)" }}>
                        <RefreshCw className="w-3.5 h-3.5" style={{ color: "rgba(5,34,16,0.5)" }} />
                    </button>
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }} rows={1} placeholder="Ask Aura…" className="flex-1 resize-none rounded-xl px-3.5 py-2.5 font-sans text-[13px] outline-none max-h-32" style={inputStyle} />
                    <button onClick={() => send(input)} disabled={sending || !input.trim()} className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 hover:scale-105" style={{ background: "#06a15c", color: "#FFFFFF" }}>
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

// ════════════════════════ DRAFT MODE ════════════════════════
function DraftPanel({ getInventory }: { getInventory: () => Promise<string> }) {
    const [freeText, setFreeText] = useState("")
    const [count, setCount] = useState(3)
    const [varyBy, setVaryBy] = useState("destination")
    const [destination, setDestination] = useState("")
    const [budget, setBudget] = useState("")
    const [month, setMonth] = useState("")
    const [adults, setAdults] = useState(2)
    const [children, setChildren] = useState(0)
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState("")
    const [result, setResult] = useState<any>(null)

    const run = async () => {
        setErr(""); setResult(null); setLoading(true)
        try {
            const inventoryText = await getInventory()
            const res = await fetch("/api/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "draft", inventoryText,
                    draftRequest: {
                        count, vary_by: varyBy, free_text: freeText,
                        known: { pax: { adults, children }, budget_band: budget || undefined, month: month || null, destination: destination || null },
                    },
                }),
            })
            const data = await res.json()
            if (!res.ok) setErr(data.error || "Failed to draft.")
            else setResult(data.draft)
        } catch (e: any) { setErr(e?.message || "Network error.") }
        finally { setLoading(false) }
    }

    return (
        <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
            <p className="font-sans text-xs" style={{ color: "rgba(5,34,16,0.55)" }}>
                On a call with no dates/destination locked? Describe the trip and Aura drafts tentative options from our real inventory.
            </p>
            <Field label="What did the client ask for?">
                <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={2} placeholder="e.g. short mountain trip, family, mid budget" className="w-full resize-none rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="How many options"><select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
                <Field label="Vary by"><select value={varyBy} onChange={(e) => setVaryBy(e.target.value)} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle}><option value="destination">Destination</option><option value="style">Style</option><option value="budget">Budget</option></select></Field>
                <Field label="Destination (optional)"><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="leave blank = vary" className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} /></Field>
                <Field label="Budget band"><select value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle}><option value="">Any</option><option value="budget">Budget</option><option value="mid">Mid</option><option value="premium">Premium</option></select></Field>
                <Field label="Travel month (optional)"><input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="e.g. June" className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} /></Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Adults"><input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} /></Field>
                    <Field label="Children"><input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} /></Field>
                </div>
            </div>
            <PrimaryButton onClick={run} loading={loading} disabled={!freeText.trim() && !destination.trim()}>
                <Wand2 className="w-4 h-4" /> Draft {count} itineraries
            </PrimaryButton>
            <ErrorBox msg={err} />

            {result && (
                <div className="space-y-4 pt-2">
                    {result.assumptions?.length > 0 && (
                        <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
                            <p className="font-sans text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "#b45309" }}>Assumptions</p>
                            <ul className="list-disc pl-4 space-y-0.5">{result.assumptions.map((a: string, i: number) => <li key={i} className="font-sans text-xs" style={{ color: "#92400e" }}>{a}</li>)}</ul>
                        </div>
                    )}
                    {(result.itineraries || []).map((it: any, idx: number) => (
                        <div key={idx} className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.08)" }}>
                            <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ background: "rgba(6,161,92,0.05)", borderBottom: "1px solid rgba(6,161,92,0.1)" }}>
                                <div>
                                    <p className="font-serif text-sm font-bold" style={{ color: "#052210" }}>{it.label || `Option ${idx + 1}`}</p>
                                    <p className="font-sans text-[11px] mt-0.5" style={{ color: "rgba(5,34,16,0.5)" }}>
                                        <MapPin className="w-3 h-3 inline mr-1" />{it.destination} · {it.duration_days}D · {it.indicative_price_band || "price TBD"}
                                    </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full font-sans text-[9px] font-bold uppercase flex-shrink-0" style={{ background: "rgba(245,158,11,0.15)", color: "#b45309" }}>Tentative</span>
                            </div>
                            <div className="p-4 space-y-2.5">
                                {(it.days || []).map((d: any, di: number) => (
                                    <div key={di} className="flex gap-2.5">
                                        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-sans text-[11px] font-bold" style={{ background: "rgba(6,161,92,0.1)", color: "#06a15c" }}>{d.day}</div>
                                        <div className="min-w-0">
                                            <p className="font-sans text-[13px] font-semibold" style={{ color: "#052210" }}>{d.title}</p>
                                            <p className="font-sans text-xs mt-0.5" style={{ color: "rgba(5,34,16,0.65)" }}>{d.plan}</p>
                                            {d.hotel?.name && <p className="font-sans text-[11px] mt-1" style={{ color: "rgba(5,34,16,0.5)" }}><Hotel className="w-3 h-3 inline mr-1" />{d.hotel.name} [{d.hotel.category}] · {d.hotel.meal_plan}</p>}
                                        </div>
                                    </div>
                                ))}
                                {it.hashtags?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{it.hashtags.map((h: string) => <span key={h} className="font-sans text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(6,161,92,0.08)", color: "#06a15c" }}>{h}</span>)}</div>}
                            </div>
                        </div>
                    ))}
                    <p className="font-sans text-[10px] text-center" style={{ color: "rgba(5,34,16,0.3)" }}>Drafts are tentative — review and edit before sending. Aura never sends to the client.</p>
                </div>
            )}
        </div>
    )
}

// ════════════════════════ COMPARE MODE ════════════════════════
function ComparePanel({ getCtx }: { getCtx: (force?: boolean) => Promise<AiContextResult | null> }) {
    const [text, setText] = useState("")
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState("")
    const [result, setResult] = useState<any>(null)

    const run = async () => {
        setErr(""); setResult(null); setLoading(true)
        try {
            const ctx = await getCtx()
            const res = await fetch("/api/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "compare", competitorText: text, ourContextText: ctx?.contextText || "" }),
            })
            const data = await res.json()
            if (!res.ok) setErr(data.error || "Failed to compare.")
            else setResult(data.comparison)
        } catch (e: any) { setErr(e?.message || "Network error.") }
        finally { setLoading(false) }
    }

    const deltaColor: Record<string, string> = { ours_better: "#06a15c", theirs_better: "#ef4444", same: "#9ca3af", unclear: "#f59e0b" }

    return (
        <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
            <p className="font-sans text-xs" style={{ color: "rgba(5,34,16,0.55)" }}>
                Client says a competitor is cheaper? Paste their quote — Aura gives an honest, apple-to-apple comparison and talking points. Never sent to the client.
            </p>
            <Field label="Competitor's quote (paste text)">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the competitor's itinerary / quote text here…" className="w-full resize-none rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} />
            </Field>
            <PrimaryButton onClick={run} loading={loading} disabled={!text.trim()}><Scale className="w-4 h-4" /> Compare</PrimaryButton>
            <ErrorBox msg={err} />

            {result && (
                <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-sans text-[11px] px-2.5 py-1 rounded-full" style={{ background: "rgba(6,161,92,0.08)", color: "#06a15c" }}>
                            Extraction confidence: {Math.round((result.confidence || 0) * 100)}%
                        </span>
                    </div>
                    {result.extraction_warnings?.length > 0 && (
                        <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
                            <ul className="list-disc pl-4 space-y-0.5">{result.extraction_warnings.map((w: string, i: number) => <li key={i} className="font-sans text-xs" style={{ color: "#92400e" }}>{w}</li>)}</ul>
                        </div>
                    )}
                    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(5,34,16,0.08)" }}>
                        <table className="w-full text-left">
                            <thead><tr style={{ background: "rgba(5,34,16,0.04)" }}>
                                {["Field", "Ours", "Theirs", ""].map(h => <th key={h} className="px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(5,34,16,0.5)" }}>{h}</th>)}
                            </tr></thead>
                            <tbody>{(result.rows || []).map((r: any, i: number) => (
                                <tr key={i} style={{ borderTop: "1px solid rgba(5,34,16,0.06)" }}>
                                    <td className="px-3 py-2 font-sans text-[12px] font-semibold" style={{ color: "#052210" }}>{r.field}</td>
                                    <td className="px-3 py-2 font-sans text-[12px]" style={{ color: "rgba(5,34,16,0.75)" }}>{r.ours}</td>
                                    <td className="px-3 py-2 font-sans text-[12px]" style={{ color: "rgba(5,34,16,0.75)" }}>{r.theirs}</td>
                                    <td className="px-3 py-2"><span className="inline-block w-2 h-2 rounded-full" style={{ background: deltaColor[r.delta] || "#9ca3af" }} title={r.delta} /></td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                    {result.price_gap_explanation && (
                        <div className="rounded-xl px-3.5 py-3" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.08)" }}>
                            <p className="font-sans text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "#06a15c" }}>Why theirs is cheaper</p>
                            <p className="font-sans text-[13px]" style={{ color: "rgba(5,34,16,0.8)" }}>{result.price_gap_explanation}</p>
                        </div>
                    )}
                    {result.differentiated_summary && (
                        <div className="rounded-xl px-3.5 py-3" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.08)" }}>
                            <div className="flex items-center justify-between mb-1"><p className="font-sans text-[11px] font-bold uppercase tracking-wide" style={{ color: "#06a15c" }}>Summary to say</p><CopyButton text={result.differentiated_summary} /></div>
                            <p className="font-sans text-[13px]" style={{ color: "rgba(5,34,16,0.8)" }}>{result.differentiated_summary}</p>
                        </div>
                    )}
                    {result.usp_talking_points?.length > 0 && (
                        <div>
                            <p className="font-sans text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "#06a15c" }}>Talking points</p>
                            <div className="space-y-2">{result.usp_talking_points.map((p: any, i: number) => (
                                <div key={i} className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(6,161,92,0.05)", border: "1px solid rgba(6,161,92,0.12)" }}>
                                    <p className="font-sans text-[13px]" style={{ color: "#052210" }}>{p.point}</p>
                                    {p.based_on && <p className="font-sans text-[10px] mt-1" style={{ color: "rgba(5,34,16,0.45)" }}>based on: {p.based_on}</p>}
                                </div>
                            ))}</div>
                        </div>
                    )}
                    {result.confirm_with_client?.length > 0 && (
                        <div className="rounded-xl px-3.5 py-3" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)" }}>
                            <p className="font-sans text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "#2563eb" }}>Ask the client to confirm</p>
                            <ul className="list-disc pl-4 space-y-0.5">{result.confirm_with_client.map((q: string, i: number) => <li key={i} className="font-sans text-xs" style={{ color: "#1d4ed8" }}>{q}</li>)}</ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ════════════════════════ COMPOSE MODE (language layer) ════════════════════════
function ComposePanel() {
    const [intent, setIntent] = useState("")
    const [clientMsg, setClientMsg] = useState("")
    const [target, setTarget] = useState("auto")
    const [scenario, setScenario] = useState("")
    const [facts, setFacts] = useState("")
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState("")
    const [result, setResult] = useState<any>(null)

    const run = async () => {
        setErr(""); setResult(null); setLoading(true)
        try {
            const res = await fetch("/api/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "compose", intent, clientMessage: clientMsg, target, scenario: scenario || undefined, sourceFacts: facts }),
            })
            const data = await res.json()
            if (!res.ok) setErr(data.error || "Failed to compose.")
            else setResult(data)
        } catch (e: any) { setErr(e?.message || "Network error.") }
        finally { setLoading(false) }
    }

    return (
        <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
            <p className="font-sans text-xs" style={{ color: "rgba(5,34,16,0.55)" }}>
                Draft a warm client message that mirrors their language (English / Tanglish / Tamil). Prices, dates and codes stay exactly intact.
            </p>
            <Field label="What should the message say?">
                <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={2} placeholder="e.g. follow up on the Kashmir options and ask which they prefer" className="w-full resize-none rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} />
            </Field>
            <Field label="Client's last message (for register matching)">
                <textarea value={clientMsg} onChange={(e) => setClientMsg(e.target.value)} rows={2} placeholder="paste what the client wrote…" className="w-full resize-none rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} />
            </Field>
            <Field label="Facts to keep exact (₹ amounts, dates, codes)">
                <input value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="e.g. ₹3,000 advance, balance ₹6,775, code OTKA0161" className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Language"><select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle}><option value="auto">Auto (mirror client)</option><option value="english">English</option><option value="tanglish">Tanglish</option><option value="tamil">Tamil</option></select></Field>
                <Field label="Scenario"><select value={scenario} onChange={(e) => setScenario(e.target.value)} className="w-full rounded-xl px-3 py-2 font-sans text-[13px] outline-none" style={inputStyle}><option value="">General</option><option value="itinerary_followup">Itinerary follow-up</option><option value="advance_nudge">Advance nudge</option><option value="objection_price">Price objection</option><option value="reassurance">Reassurance</option></select></Field>
            </div>
            <PrimaryButton onClick={run} loading={loading} disabled={!intent.trim()}><Languages className="w-4 h-4" /> Compose message</PrimaryButton>
            <ErrorBox msg={err} />

            {result && (
                <div className="space-y-3 pt-2">
                    <div className="rounded-2xl px-4 py-3.5" style={{ background: "#FFFFFF", border: "1px solid rgba(5,34,16,0.08)" }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "rgba(6,161,92,0.1)", color: "#06a15c" }}>{result.target}</span>
                            <CopyButton text={result.message} />
                        </div>
                        <p className="font-sans text-[14px] whitespace-pre-wrap leading-relaxed" style={{ color: "#052210" }}>{result.message}</p>
                    </div>
                    {result.warnings?.length > 0 && result.warnings.map((w: string, i: number) => (
                        <div key={i} className="rounded-xl px-3.5 py-2.5 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#b45309" }} />
                            <span className="font-sans text-xs" style={{ color: "#92400e" }}>{w}</span>
                        </div>
                    ))}
                    <p className="font-sans text-[10px] text-center" style={{ color: "rgba(5,34,16,0.3)" }}>Review before sending. Aura never auto-sends to the client.</p>
                </div>
            )}
        </div>
    )
}

// ════════════════════════ MODE BAR + SHELL ════════════════════════
const MODES: { id: Mode; label: string; icon: any; clientFacing?: boolean }[] = [
    { id: "ask", label: "Ask", icon: MessageSquare },
    { id: "draft", label: "Draft", icon: Wand2 },
    { id: "compare", label: "Compare", icon: Scale },
    { id: "compose", label: "Compose", icon: Languages },
]

function Aura({ variant }: { variant: "widget" | "page" }) {
    const { userProfile } = useAuth()
    const [mode, setMode] = useState<Mode>("ask")
    const askCtxRef = useRef<AiContextResult | null>(null)
    const invRef = useRef<string | null>(null)

    // Draft/Compose are sales-call tools — show for sales & admin; everyone gets Ask.
    const phase = userProfile ? rolePhase(userProfile.role) : "Sales"
    const showSalesTools = phase === "Sales" || phase === "Admin"
    const visibleModes = MODES.filter((m) => m.id === "ask" || showSalesTools)

    const getCtx = useCallback(
        async (force = false): Promise<AiContextResult | null> => {
            if (!userProfile) return null
            if (askCtxRef.current && !force) return askCtxRef.current
            const ctx = await buildAiContext(userProfile).catch(() => null)
            if (ctx) askCtxRef.current = ctx
            return ctx
        },
        [userProfile],
    )
    const getInventory = useCallback(async (): Promise<string> => {
        if (!userProfile) return ""
        if (invRef.current) return invRef.current
        const inv = await buildInventoryContext(userProfile).catch(() => "")
        invRef.current = inv
        return inv
    }, [userProfile])

    return (
        <div className="flex flex-col h-full" style={{ background: "#F2F4F3" }}>
            <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 overflow-x-auto" style={{ borderBottom: "1px solid rgba(5,34,16,0.07)", background: "#FFFFFF" }}>
                {visibleModes.map((m) => {
                    const active = mode === m.id
                    return (
                        <button key={m.id} onClick={() => setMode(m.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs font-semibold transition-all flex-shrink-0" style={{ background: active ? "rgba(6,161,92,0.1)" : "transparent", color: active ? "#06a15c" : "rgba(5,34,16,0.5)", border: active ? "1px solid rgba(6,161,92,0.25)" : "1px solid transparent" }}>
                            <m.icon className="w-3.5 h-3.5" />{m.label}
                        </button>
                    )
                })}
            </div>
            <div className="flex-1 min-h-0">
                {mode === "ask" && <AskPanel getCtx={getCtx} />}
                {mode === "draft" && <DraftPanel getInventory={getInventory} />}
                {mode === "compare" && <ComparePanel getCtx={getCtx} />}
                {mode === "compose" && <ComposePanel />}
            </div>
        </div>
    )
}

// ─── Floating widget ────────────────────────────────────
export function AiAssistantWidget() {
    const { userProfile } = useAuth()
    const [open, setOpen] = useState(false)
    if (!userProfile) return null
    return (
        <>
            <button onClick={() => setOpen((o) => !o)} title="Aura AI" className="fixed z-[60] bottom-5 right-5 w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #06a15c 0%, #052210 100%)", boxShadow: "0 8px 28px rgba(6,161,92,0.35)" }}>
                {open ? <X className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-white" />}
            </button>
            {open && (
                <div className="fixed z-[60] bottom-24 right-5 w-[min(440px,calc(100vw-2.5rem))] h-[min(680px,calc(100vh-8rem))] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#F2F4F3", border: "1px solid rgba(5,34,16,0.1)", boxShadow: "0 24px 60px rgba(5,34,16,0.25)" }}>
                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(135deg, #062814 0%, #052210 100%)" }}>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,161,92,0.2)" }}><Sparkles className="w-4 h-4" style={{ color: "#4ade80" }} /></div>
                            <div>
                                <p className="font-serif text-sm text-white leading-none">Aura AI</p>
                                <p className="font-sans text-[10px] text-white/50 mt-0.5 capitalize">{userProfile.role.replace(/_/g, " ")}</p>
                            </div>
                        </div>
                        <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10"><X className="w-4 h-4 text-white/70" /></button>
                    </div>
                    <div className="flex-1 min-h-0"><Aura variant="widget" /></div>
                </div>
            )}
        </>
    )
}

// ─── Full-page variant ──────────────────────────────────
export function AiAssistantFull() {
    return (
        <div className="max-w-3xl mx-auto h-[calc(100vh-12rem)]">
            <div className="h-full rounded-3xl overflow-hidden flex flex-col" style={{ border: "1px solid rgba(5,34,16,0.08)", boxShadow: "0 8px 30px rgba(0,0,0,0.05)" }}>
                <Aura variant="page" />
            </div>
        </div>
    )
}
