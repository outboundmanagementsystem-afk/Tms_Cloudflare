"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { getItineraries, getUsers, updateItinerary } from "@/lib/firestore"
import { useAuth } from "@/lib/auth-context"
import {
    buildRows, monthlySeries, trailingMonths, totals, lsq, groupBy, aging, sumKey, fmtINR, dmy, monthKey, MONTHS,
    type RegisterRow,
} from "@/lib/finance/register"
import {
    Table2, PieChart, TrendingUp, Download, RefreshCw, Plus, Sparkles, X, Database, Pencil, Calculator,
    Layers, Hourglass, CircleCheckBig, BadgeIndianRupee, Receipt, Percent, Plane, Wallet, CalendarClock,
    CalendarRange, MapPin, Award, ArrowUpRight, ArrowDownRight, Minus, Check, ArrowDownToLine, Handshake,
    type LucideIcon,
} from "lucide-react"

/* ---------------- helpers ---------------- */
function weekKey(iso: string): string {
    const d = new Date(iso + "T00:00:00"); if (isNaN(d.getTime())) return "—"
    const onejan = new Date(d.getFullYear(), 0, 1)
    const wk = Math.ceil(((+d - +onejan) / 86400000 + onejan.getDay() + 1) / 7)
    return `Wk ${wk}, ${d.getFullYear()}`
}
function svgBars(vals: number[], labels: string[], opts: any = {}): string {
    const W = 720, H = 240, padB = 26, padL = 6, padR = 6
    const all = opts.forecast != null ? vals.concat([opts.forecast]) : vals.slice()
    const max = Math.max(1, ...all); const n = all.length; const step = (W - padL - padR) / n; const bw = step * 0.58
    let s = ""
    for (let g = 1; g <= 3; g++) { const y = 18 + (H - 18 - padB) * (g / 3); const val = max * (1 - g / 3); s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#EAEFEB"/><text x="2" y="${y - 3}" font-size="9" fill="#B7C1BA">${opts.fmtY ? opts.fmtY(val) : Math.round(val)}</text>` }
    all.forEach((v, i) => {
        const x = padL + i * step + (step - bw) / 2; const h = Math.max(0, (H - 18 - padB) * (v / max)); const y = H - padB - h
        const fore = opts.forecast != null && i === all.length - 1
        s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" ${fore ? 'fill="#0F8A5F" fill-opacity="0.22" stroke="#0F8A5F" stroke-dasharray="4 3"' : 'fill="' + (opts.color || "#0F8A5F") + '"'}></rect>`
        s += `<text x="${x + bw / 2}" y="${H - 9}" font-size="8.5" text-anchor="middle" fill="${fore ? "#0F8A5F" : "#8A968F"}" ${fore ? 'font-weight="700"' : ""}>${fore ? (opts.forecastLabel || "Next") : labels[i]}</text>`
    })
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${s}</svg>`
}
function svgDonut(parts: { value: number; color: string }[]): string {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1; let a = -Math.PI / 2; const cx = 80, cy = 80, r = 64, ri2 = 42; let s = ""
    parts.forEach((p) => {
        const f = p.value / total || 0; const a2 = a + f * 2 * Math.PI
        const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
        const xi2 = cx + ri2 * Math.cos(a2), yi2 = cy + ri2 * Math.sin(a2), xi1 = cx + ri2 * Math.cos(a), yi1 = cy + ri2 * Math.sin(a), lg = f > 0.5 ? 1 : 0
        s += `<path d="M${x1} ${y1} A${r} ${r} 0 ${lg} 1 ${x2} ${y2} L${xi2} ${yi2} A${ri2} ${ri2} 0 ${lg} 0 ${xi1} ${yi1} Z" fill="${p.color}"/>`; a = a2
    })
    return `<svg viewBox="0 0 160 160" width="150" height="150">${s}</svg>`
}
function downloadCSV(arr: any[][], name: string) {
    const csv = arr.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click()
}

const ACCENTS: Record<string, [string, string]> = {
    green: ["var(--green)", "var(--green-bg)"], amber: ["var(--amber)", "var(--amber-bg)"],
    red: ["var(--red)", "var(--red-bg)"], primary: ["var(--primary)", "var(--primary-tint)"],
}
function Metric({ accent, icon: Icon, label, value, foot }: { accent: string; icon: LucideIcon; label: string; value: string; foot?: ReactNode }) {
    const c = ACCENTS[accent] || ACCENTS.primary
    return (
        <div className="metric" style={{ ["--accent" as any]: c[0], ["--accent-bg" as any]: c[1] }}>
            <div className="metric-top"><div className="metric-ico"><Icon size={19} /></div><div className="metric-label">{label}</div></div>
            <div className="metric-value tnum">{value}</div>
            {foot && <div className="metric-foot">{foot}</div>}
        </div>
    )
}
function StatusPill({ status }: { status: string }) {
    if (status === "NO_PRICE") return <span className="pill" style={{ color: "var(--fg3)", background: "#eef1ef" }}>No Price</span>
    const cls = status === "PAID" ? "pill-paid" : status === "PARTIAL" ? "pill-partial" : "pill-unpaid"
    return <span className={"pill " + cls}><span className="dot" />{status === "UNPAID" ? "UNPAID" : status}</span>
}
function Cmp({ label, cur, prev, money }: { label: string; cur: number; prev: number; money?: boolean }) {
    const diff = prev ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0
    const cls = Math.abs(diff) < 0.5 ? "flat" : diff >= 0 ? "up" : "down"
    const Ico = cls === "flat" ? Minus : diff >= 0 ? ArrowUpRight : ArrowDownRight
    return (
        <div className="cmp">
            <div className="l">{label}</div>
            <div className="v tnum">{money ? fmtINR(cur) : Math.round(cur)}</div>
            <div className={"d " + cls}><Ico />{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</div>
            <div className="prev">was {money ? fmtINR(prev) : Math.round(prev)} prior</div>
        </div>
    )
}

const FIN_KEYS = ["finType", "finGstInvNo", "finCity", "finAgentGst", "finAgentPaid", "finTcs", "finDmc", "finR1", "finR2"]

/* ================================================================= */
export function RegisterView() {
    const { userProfile } = useAuth()
    const [itins, setItins] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<"register" | "reports" | "analytics">("register")
    const today = useMemo(() => new Date(), [])

    useEffect(() => {
        ;(async () => {
            try {
                const [i, u] = await Promise.all([getItineraries(), getUsers()])
                setItins(i as any[]); setUsers(u as any[])
            } catch (e) { console.error(e) } finally { setLoading(false) }
        })()
    }, [])

    const rows = useMemo(() => buildRows(itins, users), [itins, users])

    // register filters
    const [fStatus, setFStatus] = useState("all")
    const [fMonth, setFMonth] = useState("all")
    const [fRep, setFRep] = useState("all")
    const [search, setSearch] = useState("")
    const [editId, setEditId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const counts = { all: rows.length, UNPAID: rows.filter(r => r.status === "UNPAID").length, PARTIAL: rows.filter(r => r.status === "PARTIAL").length, PAID: rows.filter(r => r.status === "PAID").length }
    const months = ["all", ...Array.from(new Set(rows.map(r => r.month)))]
    const reps = ["all", ...Array.from(new Set(rows.map(r => r.rep)))]
    const filtered = rows.filter(r => {
        if (fStatus !== "all" && r.status !== fStatus) return false
        if (fMonth !== "all" && r.month !== fMonth) return false
        if (fRep !== "all" && r.rep !== fRep) return false
        if (search) { const q = search.toLowerCase(); if (!`${r.customer} ${r.rep} ${r.gstInvNo} ${r.destination} ${r.mobile}`.toLowerCase().includes(q)) return false }
        return true
    })
    const editRow = editId ? rows.find(r => r.id === editId) || null : null

    const saveEntry = async (id: string, fin: Record<string, any>) => {
        setSaving(true)
        try {
            await updateItinerary(id, fin)
            setItins(prev => prev.map(i => i.id === id ? { ...i, ...fin } : i))
            setEditId(null)
        } catch (e: any) { alert("Failed to save: " + (e?.message || "error")) } finally { setSaving(false) }
    }

    // Inline editing: update local state on every keystroke (live recompute), persist on blur/commit.
    const setLocalField = (id: string, patch: Record<string, any>) => setItins(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    const commitField = async (id: string, patch: Record<string, any>) => {
        setLocalField(id, patch)
        try { await updateItinerary(id, patch) } catch (e) { console.error("inline save failed", e) }
    }

    const exportRegister = () => {
        const cols = ["Sl", "Status", "Month", "Type", "Entry Date", "GST Inv No", "Team Lead", "Rep", "Customer", "Mobile", "City", "Members", "Travel Month", "Check-in", "Check-out", "Destination", "Package", "Total Inc GST", "Total Cost", "Received", "Adv %", "Balance", "Agent Fees +GST", "Agent Fees", "Amt Paid", "Balance 2", "GST @5%", "TCS @2%", "Revenue", "Rev %", "DMC", "Remarks 1", "Remarks 2"]
        const data = filtered.map((r, i) => [i + 1, r.status, r.month, r.type, r.entryDate, r.gstInvNo, r.teamLead, r.rep, r.customer, r.mobile, r.city, r.members, r.travelMonth, r.checkin, r.checkout, r.destination, r.pkg, r.incgst, Math.round(r.totalCost), r.received, r.advPct + "%", r.balance, r.agentGst, Math.round(r.agentFees), r.agentPaid, r.balance2, Math.round(r.gst5), r.tcs, Math.round(r.revenue), r.revenuePct + "%", r.dmc, r.r1, r.r2])
        downloadCSV([cols, ...data], "finance-register.csv")
    }

    return (
        <div className="fin-scope">
            <div className="page">
                <div className="page-head">
                    <div className="grow">
                        <h1 className="page-title">Finance Register</h1>
                        <p className="page-sub">Every booking, auto-filled from the TMS. Finance fills only the highlighted fields — the rest calculates itself.</p>
                    </div>
                    <div className="page-head-actions">
                        <button className="btn btn-ghost" onClick={exportRegister}><Download size={16} />Export CSV</button>
                        <button className="btn btn-primary" onClick={() => { setLoading(true); getItineraries().then(i => { setItins(i as any[]); setLoading(false) }) }}><RefreshCw size={16} />Sync</button>
                    </div>
                </div>

                <div className="tabs">
                    <button className={"tab" + (tab === "register" ? " active" : "")} onClick={() => setTab("register")}><Table2 />Register</button>
                    <button className={"tab" + (tab === "reports" ? " active" : "")} onClick={() => setTab("reports")}><PieChart />Reports</button>
                    <button className={"tab" + (tab === "analytics" ? " active" : "")} onClick={() => setTab("analytics")}><TrendingUp />P&amp;L &amp; Analytics</button>
                </div>

                {loading ? (
                    <div style={{ padding: "60px", textAlign: "center" }}><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#0f8a5f", borderTopColor: "transparent" }} /></div>
                ) : tab === "register" ? (
                    <RegisterTab {...{ rows, filtered, counts, months, reps, fStatus, setFStatus, fMonth, setFMonth, fRep, setFRep, search, setSearch, setEditId, local: setLocalField, commit: commitField }} />
                ) : tab === "reports" ? (
                    <ReportsTab rows={rows} today={today} />
                ) : (
                    <AnalyticsTab rows={rows} today={today} />
                )}
            </div>

            {/* entry drawer */}
            <div className="fin-drawer-root">
                <div className={"scrim" + (editRow ? " open" : "")} onClick={() => setEditId(null)} />
                <div className={"drawer" + (editRow ? " open" : "")}>
                    {editRow && <EntryDrawer row={editRow} userName={userProfile?.name || ""} saving={saving} onClose={() => setEditId(null)} onSave={saveEntry} />}
                </div>
            </div>
        </div>
    )
}

/* ---------------- Register tab ---------------- */
function RegisterTab({ filtered, counts, months, reps, fStatus, setFStatus, fMonth, setFMonth, fRep, setFRep, search, setSearch, setEditId, local, commit }: any) {
    const sum = (k: keyof RegisterRow) => sumKey(filtered, k)
    const revPctTotal = (sum("totalCost") - sum("tcs")) > 0 ? Math.round(sum("revenue") / (sum("totalCost") - sum("tcs")) * 100) : 0
    const FILTERS = [["all", "All"], ["UNPAID", "Unpaid"], ["PARTIAL", "Partial"], ["PAID", "Fully Paid"]]
    return (
        <>
            <div className="hint"><Sparkles size={17} /><div><b>How this replaces Excel:</b> 23 of 32 columns come from your bookings or calculate automatically. Click a customer to open the entry card and fill the 9 finance fields — no #DIV/0!, no blank rows, no broken formulas.</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                <div className="chips">
                    {FILTERS.map(([id, l]) => <button key={id} className={"chip" + (fStatus === id ? " active" : "")} onClick={() => setFStatus(id)}>{l}<span className="ct tnum">{(counts as any)[id]}</span></button>)}
                </div>
                <select className="inp" style={{ width: "auto", height: 38, borderRadius: 10, border: "1px solid var(--border-2)", padding: "0 10px" }} value={fMonth} onChange={e => setFMonth(e.target.value)}>{months.map((m: string) => <option key={m} value={m}>{m === "all" ? "All entry months" : m}</option>)}</select>
                <select className="inp" style={{ width: "auto", height: 38, borderRadius: 10, border: "1px solid var(--border-2)", padding: "0 10px" }} value={fRep} onChange={e => setFRep(e.target.value)}>{reps.map((r: string) => <option key={r} value={r}>{r === "all" ? "All reps" : r}</option>)}</select>
                <div style={{ flex: 1 }} />
                <div className="search" style={{ width: 280 }}><input placeholder="Search customer, rep, invoice…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            </div>
            <div className="legend">
                <span><i className="sw" />Auto from TMS</span>
                <span><i className="sw derived" />Auto-calculated</span>
                <span><i className="sw manual" />Finance enters this</span>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
                <div className="reg-wrap">
                    <table className="reg">
                        <thead><tr>
                            {["Sl", "Status", "Month", "Type", "Entry Date", "GST Inv. No", "Team Lead", "Rep", "Customer", "Mobile", "City"].map(h => <th key={h}>{h}</th>)}
                            <th className="num">Members</th>{["Travel Month", "Check-in", "Check-out", "Destination", "Package"].map(h => <th key={h}>{h}</th>)}
                            {["Total Inc GST", "Total Cost", "Received", "Adv %", "Balance", "Agent Fees +GST", "Agent Fees", "Amt Paid", "Balance 2", "GST @5%", "TCS @2%", "Revenue", "Rev %", "DMC"].map(h => <th key={h} className="num">{h}</th>)}
                            <th>Remarks 1</th><th>Remarks 2</th>
                        </tr></thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={33} style={{ textAlign: "center", padding: "40px", color: "var(--fg3)" }}>No bookings match your filters.</td></tr>
                            ) : filtered.map((r: RegisterRow, i: number) => (
                                <tr key={r.id}>
                                    <td className="derived">{i + 1}</td>
                                    <td><StatusPill status={r.status} /></td>
                                    <td className="derived">{r.month}</td>
                                    <td className="manual"><select value={r.type} onChange={e => commit(r.id, { finType: e.target.value })}><option>Domestic</option><option>International</option></select></td>
                                    <td>{dmy(r.entryDate)}</td>
                                    <td className="manual"><input value={r.gstInvNo} placeholder="INV-…" onChange={e => local(r.id, { finGstInvNo: e.target.value })} onBlur={e => commit(r.id, { finGstInvNo: e.target.value })} /></td>
                                    <td>{r.teamLead}</td>
                                    <td style={{ fontWeight: 600 }}>{r.rep}</td>
                                    <td className="cust-link" onClick={() => setEditId(r.id)} title="Open finance entry">{r.customer}</td>
                                    <td className="tnum">{r.mobile}</td>
                                    <td className="manual"><input value={r.city} placeholder="City" onChange={e => local(r.id, { finCity: e.target.value })} onBlur={e => commit(r.id, { finCity: e.target.value })} /></td>
                                    <td className="num tnum">{r.members || "—"}</td>
                                    <td>{r.travelMonth}</td>
                                    <td className="tnum">{dmy(r.checkin)}</td>
                                    <td className="tnum">{dmy(r.checkout)}</td>
                                    <td>{r.destination}</td>
                                    <td>{r.pkg}</td>
                                    <td className="num tnum" style={{ fontWeight: 700 }}>{fmtINR(r.incgst)}</td>
                                    <td className="num derived tnum">{fmtINR(r.totalCost)}</td>
                                    <td className="num tnum" style={{ color: "var(--green)", fontWeight: 700 }}>{fmtINR(r.received)}</td>
                                    <td className="num derived tnum">{r.advPct}%</td>
                                    <td className="num derived tnum">{r.balance > 0 ? <span style={{ color: "var(--red)", fontWeight: 700 }}>{fmtINR(r.balance)}</span> : fmtINR(0)}</td>
                                    <td className="manual num"><input type="number" value={r.agentGst} onChange={e => local(r.id, { finAgentGst: Number(e.target.value) || 0 })} onBlur={e => commit(r.id, { finAgentGst: Number(e.target.value) || 0 })} /></td>
                                    <td className="num derived tnum">{fmtINR(r.agentFees)}</td>
                                    <td className="manual num"><input type="number" value={r.agentPaid} onChange={e => local(r.id, { finAgentPaid: Number(e.target.value) || 0 })} onBlur={e => commit(r.id, { finAgentPaid: Number(e.target.value) || 0 })} /></td>
                                    <td className="num derived tnum">{fmtINR(r.balance2)}</td>
                                    <td className="num derived tnum">{fmtINR(r.gst5)}</td>
                                    <td className="manual num"><input type="number" value={r.tcs} onChange={e => local(r.id, { finTcs: Number(e.target.value) || 0 })} onBlur={e => commit(r.id, { finTcs: Number(e.target.value) || 0 })} /></td>
                                    <td className="num derived tnum"><b style={{ color: "var(--primary-700)" }}>{fmtINR(r.revenue)}</b></td>
                                    <td className="num derived tnum"><b style={{ color: "var(--primary-700)" }}>{r.revenuePct}%</b></td>
                                    <td className="manual num"><input type="number" value={r.dmc} onChange={e => local(r.id, { finDmc: Number(e.target.value) || 0 })} onBlur={e => commit(r.id, { finDmc: Number(e.target.value) || 0 })} /></td>
                                    <td className="manual"><input className="rem" value={r.r1} onChange={e => local(r.id, { finR1: e.target.value })} onBlur={e => commit(r.id, { finR1: e.target.value })} /></td>
                                    <td className="manual"><input className="rem" value={r.r2} onChange={e => local(r.id, { finR2: e.target.value })} onBlur={e => commit(r.id, { finR2: e.target.value })} /></td>
                                </tr>
                            ))}
                        </tbody>
                        {filtered.length > 0 && (
                            <tfoot><tr>
                                <td colSpan={17}>TOTALS · {filtered.length} bookings</td>
                                <td className="num tnum">{fmtINR(sum("incgst"))}</td>
                                <td className="num tnum">{fmtINR(sum("totalCost"))}</td>
                                <td className="num tnum">{fmtINR(sum("received"))}</td>
                                <td />
                                <td className="num tnum">{fmtINR(sum("balance"))}</td>
                                <td className="num tnum">{fmtINR(sum("agentGst"))}</td>
                                <td className="num tnum">{fmtINR(sum("agentFees"))}</td>
                                <td className="num tnum">{fmtINR(sum("agentPaid"))}</td>
                                <td className="num tnum">{fmtINR(sum("balance2"))}</td>
                                <td className="num tnum">{fmtINR(sum("gst5"))}</td>
                                <td className="num tnum">{fmtINR(sum("tcs"))}</td>
                                <td className="num tnum">{fmtINR(sum("revenue"))}</td>
                                <td className="num tnum">{revPctTotal}%</td>
                                <td className="num tnum">{fmtINR(sum("dmc"))}</td>
                                <td colSpan={2} />
                            </tr></tfoot>
                        )}
                    </table>
                </div>
            </div>
        </>
    )
}

/* ---------------- Entry drawer ---------------- */
function EntryDrawer({ row, userName, saving, onClose, onSave }: { row: RegisterRow; userName: string; saving: boolean; onClose: () => void; onSave: (id: string, fin: any) => void }) {
    const [type, setType] = useState(row.type)
    const [inv, setInv] = useState(row.gstInvNo)
    const [city, setCity] = useState(row.city)
    const [agentGst, setAgentGst] = useState(row.agentGst)
    const [paid, setPaid] = useState(row.agentPaid)
    const [tcs, setTcs] = useState(row.tcs)
    const [dmc, setDmc] = useState(row.dmc)
    const [r1, setR1] = useState(row.r1)
    const [r2, setR2] = useState(row.r2)

    const totalCost = row.totalCost, gst5 = row.gst5, balance = row.balance, advPct = row.advPct
    const agentFees = (Number(agentGst) || 0) / 1.05, balance2 = (Number(agentGst) || 0) - (Number(paid) || 0)
    const revenue = totalCost - (Number(dmc) || 0) - agentFees
    const revBase = totalCost - (Number(tcs) || 0), revPct = revBase > 0 ? Math.round(revenue / revBase * 100) : 0

    const save = () => onSave(row.id, {
        finType: type, finGstInvNo: inv, finCity: city, finAgentGst: Number(agentGst) || 0,
        finAgentPaid: Number(paid) || 0, finTcs: Number(tcs) || 0, finDmc: Number(dmc) || 0, finR1: r1, finR2: r2,
    })

    return (
        <>
            <div className="drawer-head">
                <div className="drawer-head-top">
                    <div className="dh-titles">
                        <div className="drawer-title">{row.customer}</div>
                        <div className="drawer-sub"><span className="tnum">{row.gstInvNo || row.id.slice(0, 8)}</span><span style={{ color: "var(--border-strong)" }}>·</span>{row.destination} · {row.pkg}</div>
                    </div>
                    <button className="drawer-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div style={{ marginTop: 12 }}><StatusPill status={row.status} /></div>
            </div>
            <div className="drawer-body">
                <div className="ed-sec"><Database />From the TMS — auto</div>
                <div className="kv">
                    <div><div className="k">Rep</div><div className="v">{row.rep}</div></div>
                    <div><div className="k">Team Lead</div><div className="v">{row.teamLead}</div></div>
                    <div><div className="k">Mobile</div><div className="v">{row.mobile}</div></div>
                    <div><div className="k">Members</div><div className="v">{row.members || "—"}</div></div>
                    <div><div className="k">Check-in</div><div className="v">{dmy(row.checkin)}</div></div>
                    <div><div className="k">Check-out</div><div className="v">{dmy(row.checkout)}</div></div>
                    <div><div className="k">Total Inc GST</div><div className="v">{fmtINR(row.incgst)}</div></div>
                    <div><div className="k">Received</div><div className="v">{fmtINR(row.received)}</div></div>
                </div>

                <div className="ed-sec"><Pencil />Finance entry</div>
                <div className="erow">
                    <div className="efield"><label>Type</label><select value={type} onChange={e => setType(e.target.value as any)}><option>Domestic</option><option>International</option></select></div>
                    <div className="efield"><label>GST Invoice No</label><input value={inv} onChange={e => setInv(e.target.value)} placeholder="INV-…" /></div>
                </div>
                <div className="efield"><label>City</label><input value={city} onChange={e => setCity(e.target.value)} placeholder="Customer city" /></div>
                <div className="erow">
                    <div className="efield"><label>Agent Fees (incl GST)</label><input type="number" value={agentGst} onChange={e => setAgentGst(e.target.value as any)} /></div>
                    <div className="efield"><label>Amount Paid to Agent</label><input type="number" value={paid} onChange={e => setPaid(e.target.value as any)} /></div>
                </div>
                <div className="erow">
                    <div className="efield"><label>TCS @ 2%</label><input type="number" value={tcs} onChange={e => setTcs(e.target.value as any)} /></div>
                    <div className="efield"><label>DMC Cost</label><input type="number" value={dmc} onChange={e => setDmc(e.target.value as any)} /></div>
                </div>
                <div className="efield"><label>Remarks 1</label><input value={r1} onChange={e => setR1(e.target.value)} /></div>
                <div className="efield"><label>Remarks 2</label><input value={r2} onChange={e => setR2(e.target.value)} /></div>

                <div className="ed-sec"><Calculator />Auto-calculated</div>
                <div className="calc-box">
                    <div className="calc-row"><span>Total Cost (excl GST)</span><span className="cv tnum">{fmtINR(totalCost)}</span></div>
                    <div className="calc-row"><span>GST @ 5%</span><span className="cv tnum">{fmtINR(gst5)}</span></div>
                    <div className="calc-row"><span>TCS @ 2%</span><span className="cv tnum">{fmtINR(Number(tcs) || 0)}</span></div>
                    <div className="calc-row"><span>Advance collected</span><span className="cv tnum">{advPct}%</span></div>
                    <div className="calc-row"><span>Balance from customer</span><span className="cv tnum">{fmtINR(balance)}</span></div>
                    <div className="calc-row"><span>Agent Fees (excl GST)</span><span className="cv tnum">{fmtINR(agentFees)}</span></div>
                    <div className="calc-row"><span>Agent balance (Balance 2)</span><span className="cv tnum">{fmtINR(balance2)}</span></div>
                    <div className="calc-row big"><span>Net Revenue</span><span className="cv tnum">{fmtINR(revenue)}</span></div>
                    <div className="calc-row big"><span>Revenue %</span><span className="cv tnum">{revPct}%</span></div>
                </div>
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={save} disabled={saving}><Check size={17} />{saving ? "Saving…" : "Save entry"}</button>
            </div>
        </>
    )
}

/* ---------------- Reports tab ---------------- */
function ReportsTab({ rows, today }: { rows: RegisterRow[]; today: Date }) {
    const REPORTS = [
        { id: "monthly", label: "Monthly", col: "Month", key: (r: RegisterRow) => r.month },
        { id: "weekly", label: "Weekly", col: "Week", key: (r: RegisterRow) => weekKey(r.entryDate) },
        { id: "daily", label: "Daily", col: "Day", key: (r: RegisterRow) => dmy(r.entryDate) },
        { id: "rep", label: "Person-wise (Rep)", col: "Sales Rep", key: (r: RegisterRow) => r.rep },
        { id: "tl", label: "Team Lead", col: "Team Lead", key: (r: RegisterRow) => r.teamLead },
        { id: "dest", label: "Destination", col: "Destination", key: (r: RegisterRow) => r.destination },
        { id: "status", label: "Status", col: "Status", key: (r: RegisterRow) => r.status },
        { id: "type", label: "Type", col: "Type", key: (r: RegisterRow) => r.type },
    ]
    const [cur, setCur] = useState("monthly")
    const rep = REPORTS.find(r => r.id === cur)!
    const T = totals(rows)
    const groups: Record<string, RegisterRow[]> = {}
    rows.forEach(r => { const k = rep.key(r); (groups[k] = groups[k] || []).push(r) })
    const data = Object.entries(groups).map(([k, arr]) => ({
        k, n: arr.length, sales: sumKey(arr, "incgst"), received: sumKey(arr, "received"), balance: sumKey(arr, "balance"),
        gst: sumKey(arr, "gst5"), tcs: sumKey(arr, "tcs"), agent: sumKey(arr, "agentFees"), dmc: sumKey(arr, "dmc"), revenue: sumKey(arr, "revenue"),
    })).sort((a, b) => b.sales - a.sales)

    const exportRep = () => {
        const head = [rep.col, "Bookings", "Sales Inc GST", "Collected", "Balance", "GST 5%", "TCS 2%", "Agent Fees", "DMC", "Revenue"]
        downloadCSV([head, ...data.map(d => [d.k, d.n, d.sales, d.received, d.balance, Math.round(d.gst), d.tcs, Math.round(d.agent), d.dmc, Math.round(d.revenue)])], "finance-report-" + rep.id + ".csv")
    }
    return (
        <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div className="chart-chips">{REPORTS.map(r => <button key={r.id} className={cur === r.id ? "on" : ""} onClick={() => setCur(r.id)}>{r.label}</button>)}</div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={exportRep}><Download size={16} />Export</button>
            </div>
            <div className="metric-grid">
                <Metric accent="primary" icon={Layers} label="Total Sales (Inc GST)" value={fmtINR(T.sales)} foot={`${T.n} bookings`} />
                <Metric accent="green" icon={CircleCheckBig} label="Total Collected" value={fmtINR(T.collected)} foot={`${T.sales ? Math.round(T.collected / T.sales * 100) : 0}% of sales`} />
                <Metric accent="red" icon={Hourglass} label="Outstanding Balance" value={fmtINR(T.outstanding)} foot="to collect" />
                <Metric accent="primary" icon={BadgeIndianRupee} label="Net Revenue" value={fmtINR(T.revenue)} foot="after DMC + agent fees" />
            </div>
            <div className="card table-card"><div className="table-wrap">
                <table className="tbl">
                    <thead><tr><th>{rep.col}</th><th className="num">Bookings</th><th className="num">Sales Inc GST</th><th className="num">Collected</th><th className="num">Balance</th><th className="num">GST 5%</th><th className="num">TCS 2%</th><th className="num">Agent Fees</th><th className="num">DMC</th><th className="num">Revenue</th></tr></thead>
                    <tbody>{data.map(d => (
                        <tr key={d.k}><td className="cell-primary">{d.k}</td><td className="num tnum">{d.n}</td><td className="num tnum">{fmtINR(d.sales)}</td><td className="num tnum amount-green">{fmtINR(d.received)}</td><td className="num tnum">{d.balance > 0 ? <span className="amount-red">{fmtINR(d.balance)}</span> : fmtINR(0)}</td><td className="num tnum">{fmtINR(d.gst)}</td><td className="num tnum">{fmtINR(d.tcs)}</td><td className="num tnum">{fmtINR(d.agent)}</td><td className="num tnum">{fmtINR(d.dmc)}</td><td className="num tnum"><b style={{ color: "var(--primary-700)" }}>{fmtINR(d.revenue)}</b></td></tr>
                    ))}</tbody>
                    <tfoot><tr style={{ background: "#F1F5F2", fontWeight: 800 }}><td style={{ padding: "11px 18px" }}>TOTAL</td><td className="num tnum">{T.n}</td><td className="num tnum">{fmtINR(T.sales)}</td><td className="num tnum">{fmtINR(T.collected)}</td><td className="num tnum">{fmtINR(T.outstanding)}</td><td className="num tnum">{fmtINR(T.gst)}</td><td className="num tnum">{fmtINR(T.tcs)}</td><td className="num tnum">{fmtINR(T.agentFees)}</td><td className="num tnum">{fmtINR(T.dmc)}</td><td className="num tnum">{fmtINR(T.revenue)}</td></tr></tfoot>
                </table>
            </div></div>
        </>
    )
}

/* ---------------- Analytics tab ---------------- */
function AnalyticsTab({ rows, today }: { rows: RegisterRow[]; today: Date }) {
    const [metric, setMetric] = useState<"revenue" | "sales" | "collected" | "n">("revenue")
    const keys = trailingMonths(today, 12)
    const ser = monthlySeries(rows, keys)
    const cur = ser[11], prev = ser[10]
    const T = totals(rows)
    const margin = (T.netSales - T.tcs) > 0 ? Math.round(T.revenue / (T.netSales - T.tcs) * 100) : 0

    const vals = ser.map(s => (s as any)[metric] as number)
    const fit = lsq(vals); const next = Math.max(0, fit.at(12))
    const labels = keys.map(k => k.split(" ")[0])
    const money = metric !== "n"
    const chart = svgBars(vals, labels, { forecast: next, color: metric === "collected" ? "#15803D" : "#0F8A5F", fmtY: (v: number) => money ? "₹" + Math.round(v / 1000) + "k" : Math.round(v) })

    const rys = ser.map(s => s.revenue); const rf = lsq(rys); const rNext = Math.max(0, rf.at(12)); const rQ = Math.max(0, rf.at(12) + rf.at(13) + rf.at(14))
    const avg = rys.reduce((a, b) => a + b, 0) / rys.length; const growth = avg ? rf.slope / avg * 100 : 0

    const grossProfit = T.netSales - T.dmc; const pc = (v: number) => T.netSales ? Math.round(v / T.netSales * 100) + "%" : "—"
    const last6 = ser.slice(6), prior6 = ser.slice(0, 6); const S = (a: any[], k: string) => a.reduce((s, m) => s + m[k], 0)

    const dest = groupBy(rows, r => r.destination)
    const intl = sumKey(rows.filter(r => r.type === "International"), "revenue"), dom = sumKey(rows.filter(r => r.type === "Domestic"), "revenue")
    const repAgg = groupBy(rows, r => r.rep).slice(0, 5); const rmax = Math.max(1, ...repAgg.map(x => x.revenue))
    const ag = aging(rows, today); const amax = Math.max(1, ag.overdue, ag.soon, ag.upcoming)
    const agentPending = rows.reduce((s, r) => s + Math.max(0, r.balance2), 0)

    const PLRow = ({ l, a, neg, cls, pcv }: any) => (
        <div className={"pl-row " + (cls || "") + (neg ? " pl-neg" : "")}><span className="lbl">{l}</span><span className="pc">{pcv || ""}</span><span className="amt tnum">{neg ? "(" : ""}{fmtINR(a)}{neg ? ")" : ""}</span></div>
    )
    return (
        <>
            <div className="metric-grid">
                <Metric accent="primary" icon={BadgeIndianRupee} label="Net Revenue" value={fmtINR(T.revenue)} foot={`${margin}% net margin`} />
                <Metric accent="green" icon={TrendingUp} label="Total Sales (Inc GST)" value={fmtINR(T.sales)} foot={`${T.n} bookings`} />
                <Metric accent="green" icon={CircleCheckBig} label="Total Collected" value={fmtINR(T.collected)} foot={`${T.sales ? Math.round(T.collected / T.sales * 100) : 0}% of sales`} />
                <Metric accent="red" icon={Hourglass} label="Outstanding" value={fmtINR(T.outstanding)} foot="to be collected" />
                <Metric accent="amber" icon={Receipt} label="GST Payable @5%" value={fmtINR(T.gst)} foot="to government" />
                <Metric accent="amber" icon={Percent} label="TCS Collected @2%" value={fmtINR(T.tcs)} foot="tax at source" />
                <Metric accent="primary" icon={Plane} label="DMC / Supplier Cost" value={fmtINR(T.dmc)} foot="cost of sales" />
                <Metric accent="primary" icon={Wallet} label="Avg Booking Value" value={fmtINR(T.sales / Math.max(1, T.n))} foot="per booking" />
            </div>

            <div className="an-grid2">
                <div className="panel">
                    <div className="panel-title"><TrendingUp />Revenue Trend &amp; Forecast</div>
                    <div className="panel-sub">Last 12 months · dashed bar = next-month prediction</div>
                    <div className="chart-chips">
                        {[["revenue", "Net Revenue"], ["sales", "Sales (Inc GST)"], ["collected", "Collected"], ["n", "Bookings"]].map(([id, l]) => <button key={id} className={metric === id ? "on" : ""} onClick={() => setMetric(id as any)}>{l}</button>)}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: chart }} />
                    <div className="forecast">
                        <div className="fc"><div className="l">Next month revenue</div><div className="v tnum">{fmtINR(rNext)}</div><div className="s">projected (linear trend)</div></div>
                        <div className="fc"><div className="l">Next quarter</div><div className="v tnum">{fmtINR(rQ)}</div><div className="s">3-month projection</div></div>
                        <div className="fc"><div className="l">Trend</div><div className="v tnum">{growth >= 0 ? "+" : ""}{growth.toFixed(1)}%</div><div className="s">avg change / month</div></div>
                    </div>
                </div>
                <div className="panel">
                    <div className="panel-title"><BadgeIndianRupee />Profit &amp; Loss</div>
                    <div className="panel-sub">All bookings · % of net sales</div>
                    <PLRow l="Gross Sales (Inc GST)" a={T.sales} pcv={pc(T.sales)} />
                    <PLRow l="Less: GST collected @5%" a={T.gst} neg pcv={pc(T.gst)} />
                    <PLRow l="Net Sales (excl GST)" a={T.netSales} cls="sub" pcv="100%" />
                    <PLRow l="Less: DMC / supplier cost" a={T.dmc} neg pcv={pc(T.dmc)} />
                    <PLRow l="Gross Profit" a={grossProfit} cls="sub" pcv={pc(grossProfit)} />
                    <PLRow l="Less: Agent fees / commission" a={T.agentFees} neg pcv={pc(T.agentFees)} />
                    <PLRow l="Net Revenue (operating profit)" a={T.revenue} cls="total" pcv={pc(T.revenue)} />
                    <div style={{ fontSize: 11.5, color: "var(--fg3)", marginTop: 10 }}>TCS {fmtINR(T.tcs)} is collected from clients and paid to govt — a liability, not income.</div>
                </div>
            </div>

            <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-title"><CalendarClock />This month vs last month</div>
                <div className="panel-sub">{cur.key} vs {prev.key}</div>
                <div className="cmp-grid">
                    <Cmp label="Net Revenue" cur={cur.revenue} prev={prev.revenue} money /><Cmp label="Sales (Inc GST)" cur={cur.sales} prev={prev.sales} money /><Cmp label="Collected" cur={cur.collected} prev={prev.collected} money /><Cmp label="Bookings" cur={cur.n} prev={prev.n} />
                </div>
            </div>
            <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-title"><CalendarRange />Last 6 months vs prior 6 months</div>
                <div className="panel-sub">{last6[0].key}–{last6[5].key} vs {prior6[0].key}–{prior6[5].key}</div>
                <div className="cmp-grid">
                    <Cmp label="Net Revenue" cur={S(last6, "revenue")} prev={S(prior6, "revenue")} money /><Cmp label="Sales (Inc GST)" cur={S(last6, "sales")} prev={S(prior6, "sales")} money /><Cmp label="Collected" cur={S(last6, "collected")} prev={S(prior6, "collected")} money /><Cmp label="Bookings" cur={S(last6, "n")} prev={S(prior6, "n")} />
                </div>
            </div>

            <div className="an-grid2b">
                <div className="panel">
                    <div className="panel-title"><MapPin />Profit by destination</div>
                    <div className="panel-sub">Where the margin actually comes from</div>
                    <div style={{ overflow: "auto", maxHeight: 300 }}>
                        <table className="mini-table"><thead><tr><th>Destination</th><th className="num">Trips</th><th className="num">Sales</th><th className="num">DMC</th><th className="num">Revenue</th><th className="num">Margin</th></tr></thead>
                            <tbody>{dest.map(d => <tr key={d.key}><td style={{ fontWeight: 700 }}>{d.key}</td><td className="num tnum">{d.n}</td><td className="num tnum">{fmtINR(d.sales)}</td><td className="num tnum">{fmtINR(d.dmc)}</td><td className="num tnum" style={{ color: "var(--primary-700)", fontWeight: 700 }}>{fmtINR(d.revenue)}</td><td className="num tnum">{d.margin}%</td></tr>)}</tbody>
                        </table>
                    </div>
                </div>
                <div className="panel">
                    <div className="panel-title"><PieChart />Revenue by type</div>
                    <div className="panel-sub">Domestic vs International</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div dangerouslySetInnerHTML={{ __html: svgDonut([{ value: intl, color: "#0F8A5F" }, { value: dom, color: "#6D28D9" }]) }} />
                        <div className="legend-row"><span><i className="sw2" style={{ background: "#0F8A5F" }} />International {fmtINR(intl)}</span><span><i className="sw2" style={{ background: "#6D28D9" }} />Domestic {fmtINR(dom)}</span></div>
                    </div>
                </div>
            </div>

            <div className="an-grid2b">
                <div className="panel">
                    <div className="panel-title"><Award />Top performers (by revenue)</div>
                    <div className="panel-sub">Sales reps ranked on net revenue generated</div>
                    <div style={{ marginTop: 6 }}>{repAgg.map(x => <div className="hbar" key={x.key}><span className="nm">{x.key}</span><span className="track"><span className="fill" style={{ width: x.revenue / rmax * 100 + "%" }} /></span><span className="vv tnum">{fmtINR(x.revenue)}</span></div>)}</div>
                </div>
                <div className="panel">
                    <div className="panel-title"><Hourglass />Receivables aging</div>
                    <div className="panel-sub">Outstanding balances by how close the trip is</div>
                    <div style={{ marginTop: 6 }}>
                        <div className="hbar"><span className="nm">Overdue</span><span className="track"><span className="fill" style={{ width: ag.overdue / amax * 100 + "%", background: "#C81E1E" }} /></span><span className="vv tnum">{fmtINR(ag.overdue)}</span></div>
                        <div className="hbar"><span className="nm">Due ≤ 7 days</span><span className="track"><span className="fill" style={{ width: ag.soon / amax * 100 + "%", background: "#B45309" }} /></span><span className="vv tnum">{fmtINR(ag.soon)}</span></div>
                        <div className="hbar"><span className="nm">Upcoming</span><span className="track"><span className="fill" style={{ width: ag.upcoming / amax * 100 + "%", background: "#0E7490" }} /></span><span className="vv tnum">{fmtINR(ag.upcoming)}</span></div>
                    </div>
                </div>
            </div>

            <div className="panel">
                <div className="panel-title"><Wallet />Cash position &amp; liabilities</div>
                <div className="panel-sub">What's in, what's owed, what's payable to govt &amp; suppliers</div>
                <div className="an-grid2b" style={{ margin: 0 }}>
                    <div>
                        <div className="kv2"><span className="k"><ArrowDownToLine />Collected (received)</span><span className="v tnum" style={{ color: "var(--green)" }}>{fmtINR(T.collected)}</span></div>
                        <div className="kv2"><span className="k"><Hourglass />Outstanding receivable</span><span className="v tnum" style={{ color: "var(--red)" }}>{fmtINR(T.outstanding)}</span></div>
                        <div className="kv2"><span className="k"><Plane />DMC committed (cost)</span><span className="v tnum">{fmtINR(T.dmc)}</span></div>
                    </div>
                    <div>
                        <div className="kv2"><span className="k"><Receipt />GST payable to govt</span><span className="v tnum">{fmtINR(T.gst)}</span></div>
                        <div className="kv2"><span className="k"><Percent />TCS payable to govt</span><span className="v tnum">{fmtINR(T.tcs)}</span></div>
                        <div className="kv2"><span className="k"><Handshake />Agent payouts pending</span><span className="v tnum">{fmtINR(agentPending)}</span></div>
                    </div>
                </div>
            </div>
        </>
    )
}
