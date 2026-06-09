"use client"

import { useEffect, useRef, useState } from "react"
import {
    X, Receipt, UserRound, PlusCircle, Check, TriangleAlert, Info, CircleCheckBig,
    Landmark, Smartphone, Banknote, BadgeCheck, Clock, type LucideIcon,
} from "lucide-react"
import { fmtINR, fmtDate, type DerivedBooking, type Method, type Stage, type PayType } from "@/lib/finance/derive"
import { StatusPill, SLABadge, TypePill, StageBadge, MethodLabel, VerifyBadge, Progress } from "@/components/finance/ui"

export interface RecordPayload {
    date: string
    amount: number
    method: Method
    stage: Stage
    collectedBy: string
    verification: "Verified" | "Recorded"
    type: PayType
}

const METHODS: { id: Method; icon: LucideIcon }[] = [
    { id: "Bank Transfer", icon: Landmark },
    { id: "UPI", icon: Smartphone },
    { id: "Cash", icon: Banknote },
]
const STAGES: Stage[] = ["Sales", "Pre-Ops", "Post-Ops"]

function todayISO() {
    return new Date().toISOString().split("T")[0]
}

function RecordPaymentForm({
    booking, autoFocus, userName, onRecord, recording,
}: {
    booking: DerivedBooking
    autoFocus?: boolean
    userName: string
    onRecord: (id: string, p: RecordPayload) => void
    recording?: boolean
}) {
    const defaultType: PayType = booking.collected <= 0 ? "ADVANCE" : "BALANCE"
    const [f, setF] = useState({
        amount: "",
        method: "Bank Transfer" as Method,
        stage: "Sales" as Stage,
        collectedBy: userName,
        date: todayISO(),
        type: defaultType,
        verified: false,
    })
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setF((p) => ({ ...p, collectedBy: userName, type: booking.collected <= 0 ? "ADVANCE" : "BALANCE", amount: "", verified: false }))
    }, [booking.id, userName, booking.collected])

    useEffect(() => {
        if (autoFocus && ref.current) {
            const t = setTimeout(() => ref.current?.focus(), 340)
            return () => clearTimeout(t)
        }
    }, [autoFocus, booking.id])

    const amt = Number(f.amount) || 0
    const willClear = amt >= booking.balance && amt > 0
    const over = amt > booking.balance && booking.balance > 0

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        if (amt <= 0) return
        onRecord(booking.id, {
            date: f.date,
            amount: amt,
            method: f.method,
            stage: f.stage,
            collectedBy: f.collectedBy,
            verification: f.verified ? "Verified" : "Recorded",
            type: willClear && booking.collected <= 0 ? "FULL" : f.type,
        })
    }

    if (booking.balance <= 0) {
        return (
            <div className="form-card" style={{ textAlign: "center" }}>
                <div style={{ color: "var(--green)", marginBottom: 8 }}>
                    <CircleCheckBig size={28} strokeWidth={1.8} style={{ display: "inline" }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Balance fully collected</div>
                <div style={{ color: "var(--fg2)", fontSize: 13, marginTop: 4 }}>This booking has no outstanding balance.</div>
            </div>
        )
    }

    return (
        <form className="form-card" onSubmit={submit}>
            <div className="fc-title">
                <PlusCircle size={18} strokeWidth={2} />
                Record Payment
            </div>

            <div className="field-row">
                <div className="field">
                    <label>Amount (₹)</label>
                    <div className="inp-wrap">
                        <span className="prefix">₹</span>
                        <input ref={ref} className="inp with-prefix tnum" type="number" min={1} inputMode="numeric"
                            placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
                    </div>
                </div>
                <div className="field">
                    <label>Date</label>
                    <input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
                </div>
            </div>

            <div className="field">
                <label>Payment Method</label>
                <div className="seg">
                    {METHODS.map((m) => (
                        <button type="button" key={m.id} className={f.method === m.id ? "on" : ""} onClick={() => setF({ ...f, method: m.id })}>
                            <m.icon />
                            {m.id}
                        </button>
                    ))}
                </div>
            </div>

            <div className="field">
                <label>Collection Stage</label>
                <div className="seg">
                    {STAGES.map((s) => (
                        <button type="button" key={s} className={f.stage === s ? "on" : ""} onClick={() => setF({ ...f, stage: s })}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <div className="field-row">
                <div className="field">
                    <label>Collected By</label>
                    <input className="inp" value={f.collectedBy} onChange={(e) => setF({ ...f, collectedBy: e.target.value })} />
                </div>
                <div className="field">
                    <label>Verification</label>
                    <button type="button" className="inp" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", color: f.verified ? "var(--green)" : "var(--fg2)", fontWeight: 700, cursor: "pointer" }} onClick={() => setF({ ...f, verified: !f.verified })}>
                        {f.verified ? <BadgeCheck size={16} strokeWidth={2.2} /> : <Clock size={16} strokeWidth={2.2} />}
                        {f.verified ? "Verified" : "Recorded"}
                    </button>
                </div>
            </div>

            {amt > 0 && (
                <div style={{ fontSize: 12.5, fontWeight: 600, margin: "2px 0 12px", color: over ? "var(--amber)" : willClear ? "var(--green)" : "var(--fg2)", display: "flex", alignItems: "center", gap: 6 }}>
                    {over ? <TriangleAlert size={14} strokeWidth={2} /> : willClear ? <CircleCheckBig size={14} strokeWidth={2} /> : <Info size={14} strokeWidth={2} />}
                    {over
                        ? "Exceeds balance — booking will be marked fully paid."
                        : willClear
                            ? "Clears the balance — booking becomes Fully Paid."
                            : "Remaining balance after this: " + fmtINR(booking.balance - amt)}
                </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={amt <= 0 || recording}>
                <Check size={17} strokeWidth={2.4} />
                {recording ? "Recording…" : `Record ${amt > 0 ? fmtINR(amt) : "Payment"}`}
            </button>
        </form>
    )
}

export function PaymentDrawer({
    booking, open, onClose, focusRecord, userName, onRecord, recording, loadingLedger,
}: {
    booking: DerivedBooking | null
    open: boolean
    onClose: () => void
    focusRecord?: boolean
    userName: string
    onRecord: (id: string, p: RecordPayload) => void
    recording?: boolean
    loadingLedger?: boolean
}) {
    const b = booking
    const ledger = b ? [...(b.payments || [])].sort((x, y) => +new Date(y.date) - +new Date(x.date)) : []

    return (
        <div className="fin-drawer-root">
            <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
            <div className={"drawer" + (open ? " open" : "")}>
                {b && (
                    <>
                        <div className="drawer-head">
                            <div className="drawer-head-top">
                                <div className="dh-titles">
                                    <div className="drawer-title">{b.client.title} {b.client.name}</div>
                                    <div className="drawer-sub">
                                        <span className="tnum">{b.code}</span>
                                        <span style={{ color: "var(--border-strong)" }}>·</span>
                                        {b.destination} · {b.duration}
                                    </div>
                                </div>
                                <button className="drawer-close no-print" onClick={onClose}>
                                    <X size={18} strokeWidth={2.2} />
                                </button>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                                <StatusPill status={b.status} />
                                <SLABadge sla={b.sla} />
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: 12.5, color: "var(--fg3)", fontWeight: 600 }}>Travel {fmtDate(b.travelDate)}</span>
                            </div>
                        </div>

                        <div className="drawer-body">
                            <div className="summary-3">
                                <div>
                                    <div className="lbl">Package Total</div>
                                    <div className="val tnum" style={{ color: "var(--fg1)" }}>{fmtINR(b.total)}</div>
                                </div>
                                <div>
                                    <div className="lbl">Collected</div>
                                    <div className="val tnum" style={{ color: "var(--green)" }}>{fmtINR(b.collected)}</div>
                                </div>
                                <div>
                                    <div className="lbl">Balance Due</div>
                                    <div className="val tnum" style={{ color: b.balance > 0 ? "var(--red)" : "var(--fg3)" }}>{fmtINR(b.balance)}</div>
                                </div>
                            </div>

                            <div style={{ marginTop: 14 }}>
                                <Progress pct={b.percent} tone={b.status === "PAID" ? "green" : b.percent === 0 ? "red" : "amber"} />
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 12, fontWeight: 600, color: "var(--fg3)" }}>
                                    <span className="tnum">{b.percent}% collected</span>
                                    <span>{ledger.length} payment{ledger.length === 1 ? "" : "s"} on record</span>
                                </div>
                            </div>

                            <div className="ledger-head">
                                <span className="t">Payment Ledger</span>
                                <span className="grow" />
                                <span className="n tnum">{ledger.length} record{ledger.length === 1 ? "" : "s"}</span>
                            </div>

                            {loadingLedger ? (
                                <div className="ledger-empty"><div className="t">Loading…</div></div>
                            ) : ledger.length === 0 ? (
                                <div className="ledger-empty">
                                    <Receipt size={30} strokeWidth={1.6} />
                                    <div className="t">No payments yet</div>
                                    <div className="s">Record the first collection below.</div>
                                </div>
                            ) : (
                                ledger.map((p, i) => (
                                    <div className="ledger-item" key={i}>
                                        <div className="ledger-item-top">
                                            <div className="ledger-amt tnum">{fmtINR(p.amount)}</div>
                                            <TypePill type={p.type} />
                                            <div style={{ flex: 1 }} />
                                            <div className="ledger-date">{fmtDate(p.date)}</div>
                                        </div>
                                        <div className="ledger-meta">
                                            <MethodLabel method={p.method} />
                                            <span style={{ color: "var(--border-strong)" }}>·</span>
                                            <StageBadge stage={p.stage} />
                                            <span style={{ color: "var(--border-strong)" }}>·</span>
                                            <VerifyBadge verification={p.verification} />
                                        </div>
                                        <div className="ledger-by" style={{ marginTop: 9 }}>
                                            <UserRound size={13} strokeWidth={2} />
                                            Collected by {p.collectedBy}
                                        </div>
                                    </div>
                                ))
                            )}

                            <RecordPaymentForm booking={b} autoFocus={focusRecord} userName={userName} onRecord={onRecord} recording={recording} />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
