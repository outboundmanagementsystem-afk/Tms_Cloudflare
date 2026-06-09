"use client"

// My / Team / Org Target Dashboard — role-based.
//  sales      → "My Target Dashboard" (own card, read-only — cannot set)
//  sales_lead → "Team Target Dashboard" (team rollup + split member targets)
//  admin/owner→ "Organisation Target Dashboard" (all teams + set/split)
// Data + the chosen view come from /api/sales/target/dashboard (server decides by role).
// Design ported from sales-target-dashboard.html, scoped under `.tg`.

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState, useCallback } from "react"

export default function MyTargetPage() {
  return (
    <ProtectedRoute allowedRoles={["sales", "sales_lead", "admin", "owner"]}>
      <TargetDashboard />
    </ProtectedRoute>
  )
}

// ── formatting helpers ──
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN")
const L = (n: number) => "₹" + ((n || 0) / 1e5).toFixed(2).replace(/\.?0+$/, "") + "L"
const pc = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 100) : 0)
const sum = (a: number[]) => a.reduce((s, x) => s + (x || 0), 0)
const mAch = (e: any) => sum(e.wk || [])
const wkT = (t: number) => (t || 0) / 4
const paceCls = (p: number, exp: number) => (p >= exp ? "g" : p >= exp - 15 ? "a" : "r")

function TargetDashboard() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"month" | "week">("month")

  const load = useCallback(async () => {
    const r = await fetch("/api/sales/target/dashboard", { cache: "no-store" })
    if (r.ok) setD(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function setTargetFor(uid: string, name: string, current: number) {
    const v = prompt(`Set ${name}'s monthly target (₹):`, current ? String(current) : "")
    if (v == null) return
    const n = Number(v.replace(/[^\d]/g, ""))
    if (!(n >= 0)) return
    const r = await fetch("/api/sales/target", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: uid, target: n }),
    })
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "Could not set target.") }
    await load()
  }

  if (loading) return <div style={{ padding: 40, color: "#5c6862" }}>Loading your targets…</div>
  if (!d) return <div style={{ padding: 40, color: "#5c6862" }}>Couldn’t load the target dashboard.</div>

  const { view, canSet, meta, id, entity } = d

  return (
    <div className="tg">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header view={view} id={id} entity={entity} meta={meta} canSet={canSet} />
      <StatRow e={entity} meta={meta} />
      <WeeklyCards e={entity} meta={meta} />
      <div className="duo">
        <CumChart e={entity} meta={meta} />
        <Ring e={entity} meta={meta} />
      </div>
      {view !== "sp" && (
        <Breakdown view={view} e={entity} meta={meta} mode={mode} setMode={setMode} canSet={canSet} onSet={setTargetFor} />
      )}
    </div>
  )
}

function Header({ view, id, entity, meta, canSet }: any) {
  const titles: any = { sp: "My Target Dashboard", tl: "Team Target Dashboard", mgr: "Organisation Target Dashboard" }
  const subs: any = {
    sp: `Welcome back, ${id.name} — your weekly run toward your ${L(entity.target)} ${meta.monthLabel} target.`,
    tl: `${id.name}'s team — ${(entity.members || []).length} salespeople working toward a combined ${L(entity.target)} target.`,
    mgr: `Org-wide view — ${L(entity.target)} target across ${(entity.teams || []).length} teams, weekly and monthly for every person.`,
  }
  return (
    <div className="head">
      <div>
        <div className="eyebrow">Sales · {id.scope}</div>
        <h1>{titles[view]}</h1>
        <p className="sub">{subs[view]}</p>
      </div>
      <div className="head-actions">
        <button className="pill-select">📅 {meta.monthLabel}</button>
        {canSet && <button className="btn primary" onClick={() => alert("Use the “Set” buttons in the breakdown below to assign and split targets.")}>◎ Set Targets</button>}
      </div>
    </div>
  )
}

function StatRow({ e, meta }: any) {
  const a = mAch(e), p = pc(a, e.target), bal = Math.max(e.target - a, 0), balP = pc(bal, e.target)
  const wa = (e.wk || [])[meta.cur - 1] || 0, wt = wkT(e.target), wp = pc(wa, wt)
  const aheadM = p >= meta.monthElapsed
  return (
    <div className="stats">
      <Stat badge="b-green" icon="◎" l="Monthly Target" v={fmt(e.target)} n={`${meta.monthLabel} · ${L(e.target)}`} />
      <Stat badge="b-blue" icon="📈" l="Achieved This Month" v={fmt(a)} n={<><b className={aheadM ? "g" : "a"}>{p}%</b> of target · {aheadM ? "ahead of" : "behind"} pace</>} />
      <Stat badge="b-amber" icon="▦" l="Balance to Target" v={fmt(bal)} n={<><b>{balP}%</b> left · {meta.daysLeft} days to go</>} />
      <Stat badge="b-violet" icon="◷" l={`This Week (W${meta.cur})`} v={L(wa)} n={<><b className={paceCls(wp, meta.wkElapsed)}>{wp}%</b> of {L(wt)} · day {meta.dayInWk}/{meta.wkDays}</>} />
    </div>
  )
}
function Stat({ badge, icon, l, v, n }: any) {
  return (
    <div className="card stat">
      <div className={`badge ${badge}`}>{icon}</div>
      <div className="l">{l}</div><div className="v">{v}</div><div className="n">{n}</div>
    </div>
  )
}

function WeeklyCards({ e, meta }: any) {
  const wt = wkT(e.target)
  return (
    <>
      <div className="sec-label"><h2>Weekly Progression</h2><span className="hint">Monthly target of {L(e.target)} split into {meta.weekDefs.length} weekly goals</span></div>
      <div className="weeks">
        {meta.weekDefs.map((w: any, i: number) => {
          const wi = i + 1, a = (e.wk || [])[i] || 0, p = pc(a, wt)
          if (wi < meta.cur) {
            const cls = p >= 88 ? "g" : p >= 75 ? "a" : "r"
            const lbl = p >= 100 ? "Exceeded" : p >= 88 ? "On target" : p >= 75 ? "Below target" : "Missed"
            return <WkCard key={wi} cls="done" n={wi} range={w.range} big={L(a)} of={`of ${L(wt)} target`} fill={cls} w={Math.min(p, 100)} badge={cls} badgeTxt={`${lbl} · ${p}%`} />
          }
          if (wi === meta.cur) {
            const cls = paceCls(p, meta.wkElapsed)
            return <WkCard key={wi} cls="cur" n={wi} range={w.range} big={L(a)} of={`of ${L(wt)} target`} fill={cls} w={Math.min(p, 100)} badge="b" badgeTxt={`In progress · day ${meta.dayInWk}/${meta.wkDays}`} />
          }
          return <WkCard key={wi} cls="up" n={wi} range={w.range} big="—" of={`target ${L(wt)}`} fill="g" w={0} badge="u" badgeTxt="Upcoming" />
        })}
      </div>
    </>
  )
}
function WkCard({ cls, n, range, big, of, fill, w, badge, badgeTxt }: any) {
  return (
    <div className={`wk ${cls}`}>
      <div className="wkn">Week {n}</div><div className="wkr">{range}</div>
      <div className="big">{big}</div><div className="of">{of}</div>
      <div className="tr"><div className={`fl ${fill}`} style={{ width: w + "%" }} /></div>
      <div className={`bdg ${badge}`}><span className="d" />{badgeTxt}</div>
    </div>
  )
}

function CumChart({ e, meta }: any) {
  const W = 540, H = 200, padL = 10, padR = 12, padT = 22, padB = 34
  const pw = W - padL - padR, ph = H - padT - padB, max = Math.max(e.target, 1), base = padT + ph
  const wt = wkT(e.target)
  const X = (i: number) => padL + pw * (i / 3)
  const Y = (v: number) => padT + ph * (1 - v / max)
  const cumT = [1, 2, 3, 4].map((k) => wt * k)
  const cumA: number[] = []; let run = 0
  for (let k = 0; k < meta.cur; k++) { run += (e.wk || [])[k] || 0; cumA.push(run) }
  const tLine = cumT.map((v, i) => `${X(i)},${Y(v)}`).join(" ")
  const aLine = cumA.map((v, i) => `${X(i)},${Y(v)}`).join(" ")
  const lastI = cumA.length - 1
  const area = cumA.length ? `${X(0)},${base} ${aLine} ${X(lastI)},${base}` : ""
  const nowV = cumA[lastI] || 0
  return (
    <div className="card panel">
      <div className="panel-h"><h3>Cumulative Pace</h3><div className="legend"><i>Achieved</i><i className="t">Target ramp</i></div></div>
      <div className="panel-sub">Running total vs the steady line needed to finish {L(e.target)} by month-end.</div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
        <line x1={padL} y1={Y(max / 2)} x2={W - padR} y2={Y(max / 2)} stroke="#eef1ec" strokeWidth={1} />
        <line x1={padL} y1={Y(max)} x2={W - padR} y2={Y(max)} stroke="#eef1ec" strokeWidth={1} />
        <text x={W - padR} y={Y(max) - 4} textAnchor="end" fontSize={9} fontWeight={700} fill="#bcc4be">{L(max)}</text>
        <text x={W - padR} y={Y(max / 2) - 4} textAnchor="end" fontSize={9} fontWeight={700} fill="#bcc4be">{L(max / 2)}</text>
        <polyline points={tLine} fill="none" stroke="#c2ccc4" strokeWidth={2} strokeDasharray="5 5" />
        {area && <polygon points={area} fill="rgba(31,157,99,.10)" />}
        {aLine && <polyline points={aLine} fill="none" stroke="#14774b" strokeWidth={2.6} strokeLinejoin="round" />}
        {cumA.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={i === lastI ? 5.5 : 4} fill="#fff" stroke="#14774b" strokeWidth={i === lastI ? 3 : 2.5} />)}
        {cumA.length > 0 && <text x={X(lastI)} y={Y(nowV) - 13} textAnchor="middle" fontSize={10} fontWeight={800} fill="#14774b">Now · {L(nowV)}</text>}
        {meta.weekDefs.map((w: any, i: number) => (
          <g key={i}>
            <text x={X(i)} y={H - 14} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#98a19a">W{i + 1}</text>
            <text x={X(i)} y={H - 2} textAnchor="middle" fontSize={8.5} fill="#bcc4be">{w.range.replace(" – ", "–").replace(/[A-Za-z]+ /, "")}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function Ring({ e, meta }: any) {
  const a = mAch(e), p = pc(a, e.target), bal = Math.max(e.target - a, 0)
  const ahead = p >= meta.monthElapsed
  const cls = ahead ? "g" : p >= meta.monthElapsed - 12 ? "a" : "r"
  const txt = ahead ? "On track · ahead of pace" : cls === "a" ? "Slightly behind pace" : "Behind pace"
  const C = 2 * Math.PI * 70
  return (
    <div className="card ringc">
      <span className="label">{meta.cur && e.members ? "Team" : e.teams ? "Org" : "Monthly"} Target Achieved</span>
      <div className="ring-wrap">
        <svg viewBox="0 0 184 184">
          <defs><linearGradient id="tgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2bbd7a" /><stop offset="100%" stopColor="#14774b" /></linearGradient></defs>
          <circle className="ring-track" cx="92" cy="92" r="70" />
          <circle className="ring-prog" cx="92" cy="92" r="70" style={{ strokeDashoffset: C * (1 - Math.min(p, 100) / 100) }} />
        </svg>
        <div className="ring-center"><div className="pct">{p}%</div><div className="of">{L(a)} of {L(e.target)}</div></div>
      </div>
      <div className={`chip ${cls}`}><span className="d" />{txt}</div>
      <div className="ring-foot"><b>{fmt(bal)}</b> left · {meta.monthElapsed}% of month elapsed</div>
    </div>
  )
}

function ProgBlock({ a, t, exp }: any) {
  const p = pc(a, t), cls = paceCls(p, exp)
  return (
    <div className="prog">
      <div className="pt"><b>{L(a)}</b><span>of {L(t)}</span></div>
      <div className="tr"><div className={`fl ${cls}`} style={{ width: Math.min(p, 100) + "%" }} /></div>
    </div>
  )
}
function EntityRow({ p, meta, mode, mem, group, canSet, onSet }: any) {
  const ma = mAch(p), mt = p.target, wa = (p.wk || [])[meta.cur - 1] || 0, wt = wkT(p.target)
  const mp = pc(ma, mt), wp = pc(wa, wt)
  const a = mode === "month" ? ma : wa, t = mode === "month" ? mt : wt, exp = mode === "month" ? meta.monthElapsed : meta.wkElapsed
  const setUid = group ? p.leadUid : p.uid
  return (
    <div className={group ? "grp" : `row ${mem ? "mem" : ""}`}>
      <div className="who">
        <div className="av">{p.short}</div>
        <div><div className="nm">{p.name}</div><div className="mt">{group ? `Team Lead · ${p.team}` : `${p.team} · target ${L(mt)}`}</div></div>
      </div>
      <ProgBlock a={a} t={t} exp={exp} />
      <div className="pills">
        <span className={`pl ${mode === "month" ? "on" : ""}`}>M {mp}%</span>
        <span className={`pl ${mode === "week" ? "on" : ""}`}>W {wp}%</span>
        {canSet && setUid && <button className="setbtn" onClick={() => onSet(setUid, p.name, mt)} title="Set / split target">Set</button>}
      </div>
    </div>
  )
}

function Breakdown({ view, e, meta, mode, setMode, canSet, onSet }: any) {
  const title = view === "tl" ? "Salesperson Breakdown" : "Team & Salesperson Breakdown"
  const subtitle = view === "tl"
    ? "Each rep’s progress toward their slice of the team target. Use Set to split."
    : "Every team lead and salesperson, rolled up to the org target. Use Set to assign team totals."
  return (
    <div className="card panel">
      <div className="bd-top">
        <div><h3>{title}</h3><div className="panel-sub" style={{ margin: "4px 0 0" }}>{subtitle}</div></div>
        <div className="seg sm">
          <button className={mode === "month" ? "on" : ""} onClick={() => setMode("month")}>Monthly</button>
          <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>This Week</button>
        </div>
      </div>
      <div className="bd">
        <div className="bd-hr"><span>{view === "tl" ? "Salesperson" : "Team / Salesperson"}</span><span>{mode === "month" ? "Monthly progress" : `Week ${meta.cur} progress`}</span><span className="rt">M / W</span></div>
        {view === "tl"
          ? (e.members || []).map((m: any) => <EntityRow key={m.uid} p={m} meta={meta} mode={mode} canSet={canSet} onSet={onSet} />)
          : (e.teams || []).map((t: any) => (
            <div key={t.leadUid || t.name}>
              <EntityRow p={t} meta={meta} mode={mode} group canSet={canSet && !!t.leadUid} onSet={onSet} />
              {(t.members || []).map((m: any) => <EntityRow key={m.uid} p={m} meta={meta} mode={mode} mem canSet={canSet} onSet={onSet} />)}
            </div>
          ))}
        {view === "tl" && (e.members || []).length === 0 && <div style={{ padding: 24, color: "#98a19a", fontSize: 13 }}>No team members assigned yet (set their team lead in HRMS).</div>}
      </div>
    </div>
  )
}

const CSS = `
.tg{--brand:#14774b;--brand-bright:#1f9d63;--green-tint:#e3f2ea;--green-soft:#f1f8f4;--amber-tint:#fbeede;--amber:#bd7a16;--amber-b:#e6a93a;--blue-tint:#e7eefb;--blue:#2c5fb8;--violet-tint:#efeafb;--violet:#6b4bc4;--rose-tint:#fdebec;--rose:#c1394a;--rose-b:#d8616e;--card:#fff;--line:#e8ebe5;--line-2:#eef1ec;--ink:#15201b;--ink-2:#5c6862;--ink-3:#98a19a;--radius:18px;--shadow:0 1px 2px rgba(20,40,30,.04),0 12px 28px -18px rgba(20,40,30,.18);--shadow-lift:0 2px 4px rgba(20,40,30,.05),0 22px 44px -22px rgba(20,40,30,.28);--serif:'Fraunces',Georgia,serif;color:var(--ink);padding:4px 2px 24px}
.tg .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.tg .eyebrow{font-size:11.5px;font-weight:800;letter-spacing:2px;color:var(--brand);text-transform:uppercase;display:flex;align-items:center;gap:8px}
.tg .eyebrow::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--green-tint),transparent);max-width:120px}
.tg .head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin:6px 0 24px;flex-wrap:wrap}
.tg h1{font-family:var(--serif);font-weight:500;font-size:32px;letter-spacing:-.5px;line-height:1.05;color:var(--ink);margin-top:7px}
.tg .sub{color:var(--ink-2);font-size:14px;margin-top:8px;max-width:600px;line-height:1.5}
.tg .head-actions{display:flex;align-items:center;gap:10px}
.tg .pill-select,.tg .btn{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;border-radius:11px;cursor:pointer;padding:10px 15px;border:1px solid var(--line);background:#fff;color:var(--ink);box-shadow:var(--shadow);transition:transform .12s,box-shadow .12s,background .12s}
.tg .pill-select:hover,.tg .btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-lift)}
.tg .btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.tg .btn.primary:hover{background:#11663f}
.tg .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.tg .stat{padding:18px 18px 16px;display:flex;flex-direction:column}
.tg .stat .badge{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;margin-bottom:14px;font-size:18px}
.tg .b-green{background:var(--green-tint);color:var(--brand)}.tg .b-blue{background:var(--blue-tint);color:var(--blue)}.tg .b-amber{background:var(--amber-tint);color:var(--amber)}.tg .b-violet{background:var(--violet-tint);color:var(--violet)}
.tg .stat .l{font-size:12px;color:var(--ink-2);font-weight:600}
.tg .stat .v{font-size:25px;font-weight:800;letter-spacing:-.7px;margin-top:3px;font-variant-numeric:tabular-nums;color:var(--ink)}
.tg .stat .n{font-size:12px;color:var(--ink-3);margin-top:6px;font-weight:500}
.tg .stat .n b{font-weight:700}.tg .n b.g{color:var(--brand)}.tg .n b.a{color:var(--amber)}.tg .n b.r{color:var(--rose)}
.tg .sec-label{display:flex;align-items:center;gap:11px;margin:6px 0 14px}
.tg .sec-label h2{font-family:var(--serif);font-weight:500;font-size:21px;letter-spacing:-.3px;color:var(--ink)}
.tg .sec-label .hint{font-size:12.5px;color:var(--ink-3);font-weight:500}
.tg .weeks{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.tg .wk{padding:17px 17px 16px;border-radius:16px;border:1px solid var(--line);background:#fff;box-shadow:var(--shadow);position:relative;overflow:hidden;transition:transform .14s,box-shadow .14s}
.tg .wk:hover{transform:translateY(-2px);box-shadow:var(--shadow-lift)}
.tg .wk .wkn{font-size:13.5px;font-weight:800;color:var(--ink)}
.tg .wk .wkr{font-size:11px;color:var(--ink-3);font-weight:600;margin-top:1px}
.tg .wk .big{font-size:22px;font-weight:800;letter-spacing:-.6px;margin-top:13px;font-variant-numeric:tabular-nums;color:var(--ink)}
.tg .wk .of{font-size:11.5px;color:var(--ink-3);font-weight:600;margin-top:1px}
.tg .wk .tr{height:7px;border-radius:99px;background:#eef1ec;margin-top:12px;overflow:hidden}
.tg .wk .fl{height:100%;width:0;border-radius:99px;transition:width 1s cubic-bezier(.2,.8,.2,1)}
.tg .fl.g{background:linear-gradient(90deg,var(--brand),var(--brand-bright))}.tg .fl.a{background:linear-gradient(90deg,var(--amber),var(--amber-b))}.tg .fl.r{background:linear-gradient(90deg,var(--rose),var(--rose-b))}
.tg .wk .bdg{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;margin-top:13px}
.tg .bdg .d{width:6px;height:6px;border-radius:50%;background:currentColor}
.tg .bdg.g{background:var(--green-tint);color:var(--brand)}.tg .bdg.a{background:var(--amber-tint);color:var(--amber)}.tg .bdg.r{background:var(--rose-tint);color:var(--rose)}.tg .bdg.b{background:var(--blue-tint);color:var(--blue)}.tg .bdg.u{background:#f1f3ef;color:var(--ink-3)}
.tg .wk.cur{border-color:#9fd0b6;background:linear-gradient(180deg,#f4fbf7,#fff);box-shadow:0 0 0 1px #cfe9da,var(--shadow-lift)}
.tg .wk.cur::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand),var(--brand-bright))}
.tg .wk.done{border-left:3px solid var(--green-tint)}
.tg .wk.up{background:#fbfcfa;border-style:dashed}.tg .wk.up .big{color:var(--ink-3)}
.tg .duo{display:grid;grid-template-columns:1.45fr 1fr;gap:18px;margin-bottom:24px}
.tg .panel{padding:22px 24px}
.tg .panel-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;flex-wrap:wrap}
.tg .panel-h h3{font-size:16px;font-weight:700;letter-spacing:-.2px}
.tg .panel-sub{font-size:12.5px;color:var(--ink-3);margin-bottom:12px}
.tg .legend{display:flex;gap:16px}
.tg .legend i{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--ink-2);font-style:normal}
.tg .legend i::before{content:"";width:14px;height:3px;border-radius:2px;background:var(--brand)}
.tg .legend i.t::before{background:repeating-linear-gradient(90deg,#c2ccc4 0 5px,transparent 5px 9px);height:2px}
.tg .chart-svg{width:100%;height:auto;display:block;margin-top:4px}
.tg .ringc{padding:22px;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;overflow:hidden}
.tg .ringc::before{content:"";position:absolute;inset:auto -45% -60% auto;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(31,157,99,.09),transparent 65%)}
.tg .ringc .label{font-size:11.5px;font-weight:800;letter-spacing:1.5px;color:var(--ink-2);text-transform:uppercase;align-self:flex-start}
.tg .ring-wrap{position:relative;width:184px;height:184px;margin:12px 0 4px}
.tg .ring-wrap svg{transform:rotate(-90deg);width:100%;height:100%}
.tg .ring-track{fill:none;stroke:#eef1ec;stroke-width:14}
.tg .ring-prog{fill:none;stroke:url(#tgrad);stroke-width:14;stroke-linecap:round;stroke-dasharray:439.8;transition:stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1)}
.tg .ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.tg .ring-center .pct{font-family:var(--serif);font-weight:500;font-size:44px;line-height:1;color:var(--ink);letter-spacing:-1px}
.tg .ring-center .of{font-size:12.5px;color:var(--ink-2);margin-top:5px;font-variant-numeric:tabular-nums}
.tg .chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;margin-top:10px}
.tg .chip.g{background:var(--green-tint);color:var(--brand)}.tg .chip.a{background:var(--amber-tint);color:var(--amber)}.tg .chip.r{background:var(--rose-tint);color:var(--rose)}
.tg .chip .d{width:7px;height:7px;border-radius:50%;background:currentColor}
.tg .ring-foot{margin-top:13px;font-size:13px;color:var(--ink-2);border-top:1px solid var(--line-2);padding-top:13px;width:100%}
.tg .ring-foot b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.tg .seg{display:inline-flex;background:#f1f3ef;border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
.tg .seg button{display:inline-flex;align-items:center;gap:6px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-2);padding:7px 13px;border-radius:9px;transition:background .12s,color .12s}
.tg .seg button:hover{color:var(--ink)}
.tg .seg button.on{background:var(--brand);color:#fff;box-shadow:0 6px 14px -8px rgba(20,119,75,.7)}
.tg .seg.sm button{padding:6px 13px;font-size:12.5px}
.tg .bd-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.tg .bd-top h3{font-size:16px;font-weight:700;letter-spacing:-.2px}
.tg .bd{margin-top:14px}
.tg .bd-hr{display:grid;grid-template-columns:1.7fr 1.6fr auto;gap:14px;align-items:center;padding:0 4px 9px;font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ink-3);text-transform:uppercase;border-bottom:1px solid var(--line)}
.tg .bd-hr .rt{text-align:right}
.tg .row{display:grid;grid-template-columns:1.7fr 1.6fr auto;gap:14px;align-items:center;padding:13px 4px;border-top:1px solid var(--line-2)}
.tg .who{display:flex;align-items:center;gap:11px;min-width:0}
.tg .who .av{width:36px;height:36px;border-radius:10px;flex:none;display:grid;place-items:center;font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,#1f9d63,#0e4d36)}
.tg .who .nm{font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tg .who .mt{font-size:11.5px;color:var(--ink-3);font-weight:500;margin-top:1px}
.tg .prog{display:flex;flex-direction:column;gap:5px}
.tg .prog .pt{display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--ink-2);font-variant-numeric:tabular-nums}
.tg .prog .pt b{color:var(--ink);font-weight:700}
.tg .prog .tr{height:8px;border-radius:99px;background:#eef1ec;overflow:hidden}
.tg .prog .fl{height:100%;width:0;border-radius:99px;transition:width .9s cubic-bezier(.2,.8,.2,1)}
.tg .pills{display:flex;gap:7px;justify-content:flex-end;align-items:center}
.tg .pl{font-size:11px;font-weight:700;padding:5px 9px;border-radius:8px;background:#f1f3ef;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.tg .pl.on{background:var(--green-tint);color:var(--brand)}
.tg .setbtn{font-size:11px;font-weight:700;padding:5px 11px;border-radius:8px;background:var(--brand);color:#fff;border:none;cursor:pointer;white-space:nowrap}
.tg .setbtn:hover{background:#11663f}
.tg .grp{display:grid;grid-template-columns:1.7fr 1.6fr auto;gap:14px;align-items:center;padding:13px 12px;margin-top:10px;border-radius:12px;background:var(--green-soft);border:1px solid #dcebe2}
.tg .grp .who .av{background:linear-gradient(135deg,#0e4d36,#072b1e);border-radius:11px}
.tg .grp .who .nm{font-size:14px}
.tg .grp .who .mt{color:var(--brand);font-weight:700}
.tg .row.mem .who{padding-left:14px;position:relative}
.tg .row.mem .who::before{content:"";position:absolute;left:2px;top:50%;width:8px;height:1px;background:var(--line)}
@media (max-width:1000px){.tg .duo{grid-template-columns:1fr}.tg .weeks{grid-template-columns:1fr 1fr}.tg .stats{grid-template-columns:1fr 1fr}}
@media (max-width:680px){.tg .bd-hr,.tg .row,.tg .grp{grid-template-columns:1.4fr 1fr}.tg .bd-hr .rt{display:none}.tg h1{font-size:26px}}
`
