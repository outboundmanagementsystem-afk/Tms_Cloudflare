"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { getItineraries, getUsers } from "@/lib/firestore"
import { Trophy, Crown, TrendingUp, TrendingDown, Minus, Maximize2, FileText, CircleCheckBig, RefreshCw } from "lucide-react"

const CLOSED = ["confirmed", "handover", "pre-ops", "post-ops", "completed"]
const PERIODS = [{ id: "today", label: "Today" }, { id: "week", label: "This Week" }, { id: "month", label: "This Month" }, { id: "all", label: "All-time" }]

function threshold(period: string, now: Date): Date | null {
    const d = new Date(now)
    if (period === "today") { d.setHours(0, 0, 0, 0); return d }
    if (period === "week") { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d }
    if (period === "month") { return new Date(now.getFullYear(), now.getMonth(), 1) }
    return null
}
function inPeriod(dateStr: any, th: Date | null): boolean {
    if (!th) return true
    const d = new Date(dateStr)
    return !isNaN(d.getTime()) && d >= th
}

interface Player { uid: string; name: string; code: string; photo?: string; generated: number; closed: number; score: number; rank: number; move: number }

const PLACE: Record<number, { avatar: number; ped: number; color: string; ring: string; medal: string; glow: string }> = {
    1: { avatar: 132, ped: 188, color: "#FFD24A", ring: "#FFB300", medal: "🥇", glow: "0 0 46px rgba(255,200,60,.5)" },
    2: { avatar: 104, ped: 134, color: "#D7DEE6", ring: "#9AA7B4", medal: "🥈", glow: "0 0 28px rgba(200,210,225,.4)" },
    3: { avatar: 88, ped: 104, color: "#E7A86B", ring: "#C9803F", medal: "🥉", glow: "0 0 24px rgba(220,150,90,.35)" },
}

function initials(name: string) { return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase() }

function Avatar({ p, size, ring }: { p: Player; size: number; ring: string }) {
    if (p.photo) {
        return <img src={p.photo} alt={p.name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `4px solid ${ring}`, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }} />
    }
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", border: `4px solid ${ring}`, display: "grid", placeItems: "center", fontWeight: 800, color: "#fff", fontSize: size * 0.34, background: "linear-gradient(150deg,#0e6f4c,#063019)", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
            {initials(p.name)}
        </div>
    )
}

function Move({ move, light }: { move: number; light?: boolean }) {
    if (move > 0) return <span style={{ color: "#34d399", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 3 }}><TrendingUp size={15} />{move}</span>
    if (move < 0) return <span style={{ color: "#f87171", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 3 }}><TrendingDown size={15} />{Math.abs(move)}</span>
    return <span style={{ color: light ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.35)", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 3 }}><Minus size={15} /></span>
}

export function Leaderboard() {
    const [itins, setItins] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState("month")
    const [ranked, setRanked] = useState<Player[]>([])
    const [updated, setUpdated] = useState("")
    const wrapRef = useRef<HTMLDivElement>(null)

    const load = async () => {
        try {
            const [i, u] = await Promise.all([getItineraries(), getUsers()])
            setItins(i as any[]); setUsers(u as any[]); setUpdated(new Date().toLocaleTimeString())
        } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t) }, [])

    useEffect(() => {
        if (!users.length) return
        const now = new Date(); const th = threshold(period, now)
        const sales = users.filter((u: any) => ["sales", "sales_lead"].includes(u.role))
        const list: Player[] = sales.map((u: any) => {
            const mine = itins.filter((i: any) => i.createdBy === u.uid && i.status && i.status !== "draft" && inPeriod(i.createdAt, th))
            const generated = mine.length
            const closed = mine.filter((i: any) => CLOSED.includes(i.status)).length
            return { uid: u.uid, name: u.name || u.email || "—", code: u.employeeCode || "", photo: u.photoURL || u.photo, generated, closed, score: closed * 10 + generated * 3, rank: 0, move: 0 }
        })
        list.sort((a, b) => b.score - a.score || b.closed - a.closed || a.name.localeCompare(b.name))
        list.forEach((r, i) => { r.rank = i + 1 })
        const key = "lb_prev_" + period
        let prev: Record<string, number> = {}
        try { prev = JSON.parse(localStorage.getItem(key) || "{}") } catch { }
        list.forEach(r => { r.move = prev[r.uid] != null ? prev[r.uid] - r.rank : 0 })
        const cur: Record<string, number> = {}; list.forEach(r => { cur[r.uid] = r.rank })
        try { localStorage.setItem(key, JSON.stringify(cur)) } catch { }
        setRanked(list)
    }, [itins, users, period])

    const top3 = ranked.slice(0, 3)
    const rest = ranked.slice(3)
    const maxScore = Math.max(1, ...ranked.map(r => r.score))

    const toggleFull = () => {
        const el = wrapRef.current as any
        if (!document.fullscreenElement) el?.requestFullscreen?.()
        else document.exitFullscreen?.()
    }

    const Podium = ({ p, place }: { p: Player; place: number }) => {
        const s = PLACE[place]
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, maxWidth: 260 }}>
                <div style={{ marginBottom: 8 }}><Move move={p.move} light /></div>
                <div style={{ position: "relative" }}>
                    {place === 1 && <Crown size={34} style={{ position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)", color: "#FFD24A", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.4))" }} />}
                    <div style={{ filter: `drop-shadow(${s.glow})` }}><Avatar p={p} size={s.avatar} ring={s.ring} /></div>
                    <div style={{ position: "absolute", bottom: -6, right: -6, fontSize: place === 1 ? 30 : 24 }}>{s.medal}</div>
                </div>
                <div style={{ marginTop: 12, fontWeight: 800, fontSize: place === 1 ? 19 : 16, color: "#fff", textAlign: "center" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{p.code}</div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11.5, color: "rgba(255,255,255,.7)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CircleCheckBig size={13} style={{ color: "#34d399" }} />{p.closed} closed</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><FileText size={13} style={{ color: "#7fd1ff" }} />{p.generated} made</span>
                </div>
                <div style={{
                    marginTop: 14, width: "100%", height: s.ped, borderRadius: "14px 14px 0 0",
                    background: `linear-gradient(180deg, ${s.color}38, ${s.color}14)`, border: `1px solid ${s.color}55`, borderBottom: "none",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 16, position: "relative", overflow: "hidden",
                }}>
                    <div style={{ fontSize: place === 1 ? 52 : 40, fontWeight: 900, color: s.color, lineHeight: 1, textShadow: "0 2px 10px rgba(0,0,0,.3)" }}>{place}</div>
                    <div style={{ marginTop: 8, fontWeight: 800, fontSize: place === 1 ? 26 : 21, color: "#fff" }}>{p.score}</div>
                    <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginTop: 2 }}>points</div>
                </div>
            </div>
        )
    }

    return (
        <div ref={wrapRef} style={{ minHeight: "100%", background: "radial-gradient(900px 500px at 50% -8%, rgba(6,161,92,.22), transparent 60%), linear-gradient(165deg,#063019 0%,#04200f 55%,#020f08 100%)", borderRadius: 20, padding: "26px 28px 40px", color: "#fff", position: "relative", overflow: "hidden" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(150deg,#FFD24A,#E8A21E)", display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(255,190,40,.4)" }}>
                    <Trophy size={24} style={{ color: "#3a2a00" }} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-.02em" }}>Sales Leaderboard</h1>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "rgba(255,255,255,.55)" }}>Ranked by deals closed &amp; itineraries created · updates live</p>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: "#34d399", boxShadow: "0 0 8px #34d399", display: "inline-block" }} className="animate-pulse" />
                    Live · {updated}
                    <button onClick={load} title="Refresh" style={{ marginLeft: 6, width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#fff", display: "grid", placeItems: "center" }}><RefreshCw size={14} /></button>
                    <button onClick={toggleFull} title="Fullscreen" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#fff", display: "grid", placeItems: "center" }}><Maximize2 size={14} /></button>
                </div>
            </div>

            {/* period tabs */}
            <div style={{ display: "inline-flex", gap: 6, background: "rgba(255,255,255,.06)", padding: 4, borderRadius: 99, marginBottom: 26 }}>
                {PERIODS.map(pr => (
                    <button key={pr.id} onClick={() => setPeriod(pr.id)} style={{
                        border: "none", borderRadius: 99, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                        background: period === pr.id ? "linear-gradient(150deg,#10b981,#06a15c)" : "transparent",
                        color: period === pr.id ? "#fff" : "rgba(255,255,255,.6)",
                    }}>{pr.label}</button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: "center", padding: 80 }}><div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#34d399", borderTopColor: "transparent" }} /></div>
            ) : ranked.length === 0 ? (
                <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,.5)" }}>No sales activity yet for this period.</div>
            ) : (
                <>
                    {/* podium: 2nd, 1st, 3rd */}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18, maxWidth: 820, margin: "0 auto" }}>
                        {top3[1] && <Podium p={top3[1]} place={2} />}
                        {top3[0] && <Podium p={top3[0]} place={1} />}
                        {top3[2] && <Podium p={top3[2]} place={3} />}
                    </div>

                    {/* the rest */}
                    {rest.length > 0 && (
                        <div style={{ maxWidth: 820, margin: "30px auto 0", display: "flex", flexDirection: "column", gap: 8 }}>
                            {rest.map(p => (
                                <div key={p.uid} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
                                    <div style={{ width: 30, fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,.55)", textAlign: "center" }}>{p.rank}</div>
                                    <Avatar p={p} size={42} ring="rgba(255,255,255,.18)" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", display: "flex", gap: 12, marginTop: 2 }}>
                                            <span>{p.closed} closed</span><span>{p.generated} itineraries</span>
                                        </div>
                                        <div style={{ marginTop: 7, height: 6, borderRadius: 99, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                                            <div style={{ height: "100%", width: `${(p.score / maxScore) * 100}%`, borderRadius: 99, background: "linear-gradient(90deg,#10b981,#34d399)" }} />
                                        </div>
                                    </div>
                                    <Move move={p.move} />
                                    <div style={{ width: 70, textAlign: "right", fontWeight: 800, fontSize: 17 }}>{p.score}<span style={{ fontSize: 10, color: "rgba(255,255,255,.45)", fontWeight: 600 }}> pts</span></div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ textAlign: "center", marginTop: 26, fontSize: 11.5, color: "rgba(255,255,255,.4)" }}>
                        Score = deals closed × 10 + itineraries created × 3 &nbsp;·&nbsp; ▲ up / ▼ down since last update
                    </div>
                </>
            )}
        </div>
    )
}
