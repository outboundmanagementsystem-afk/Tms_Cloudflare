"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { useEffect, useState } from "react"
import { getAllPayments } from "@/lib/firestore"
import { buildInvoices, fmtINR, fmtDate, type InvoiceRow } from "@/lib/finance/derive"
import { TypePill, MethodLabel, StageBadge, SearchBox, EmptyState } from "@/components/finance/ui"
import {
    Eye, Printer, SearchX, ArrowLeft, Mail, Phone, Hash, CalendarDays, Moon, Banknote,
    Image as ImageIcon, Paperclip, UserRound, BadgeCheck, Clock, CalendarCheck, ShieldCheck,
} from "lucide-react"

export default function FinanceInvoicesPage() {
    return (
        <ProtectedRoute allowedRoles={["finance", "finance_lead", "admin", "owner"]}>
            <InvoicesContent />
        </ProtectedRoute>
    )
}

function LogoMark({ size = 26 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9.2" />
            <path d="M3 12h18" />
            <path d="M12 2.8c2.7 2.4 4.2 5.8 4.2 9.2s-1.5 6.8-4.2 9.2c-2.7-2.4-4.2-5.8-4.2-9.2S9.3 5.2 12 2.8Z" />
            <path d="M16.4 7.2l4.6-1.6-1.6 4.6" />
        </svg>
    )
}

function InvoicesContent() {
    const [rows, setRows] = useState<InvoiceRow[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [detail, setDetail] = useState<InvoiceRow | null>(null)

    useEffect(() => {
        ;(async () => {
            try {
                const withPayments = await getAllPayments()
                setRows(buildInvoices(withPayments))
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    let filtered = rows
    if (search) {
        const q = search.toLowerCase()
        filtered = rows.filter((r) => `${r.client.name} ${r.code} ${r.invId} ${r.collectedBy} ${r.destination}`.toLowerCase().includes(q))
    }

    const openDetail = (r: InvoiceRow) => setDetail(r)
    const printDetail = (r: InvoiceRow) => { setDetail(r); setTimeout(() => window.print(), 250) }

    return (
        <div className="fin-scope">
            <div className="page fin-page-body">
                <div className="page-head">
                    <div className="grow">
                        <h1 className="page-title">Invoices</h1>
                        <p className="page-sub">All payment records and invoices</p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13.5, color: "var(--fg2)", fontWeight: 600 }}>
                        <span className="tnum" style={{ color: "var(--fg1)", fontWeight: 800 }}>{filtered.length}</span> payment record{filtered.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ flex: 1 }} />
                    <SearchBox value={search} onChange={setSearch} placeholder="Search by client, invoice no, code…" style={{ width: 320 }} />
                </div>

                <div className="card table-card">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Invoice No.</th>
                                    <th>Type</th>
                                    <th>Method</th>
                                    <th>Collected By</th>
                                    <th>Source</th>
                                    <th className="num">Amount</th>
                                    <th style={{ width: 92 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={8}><div style={{ padding: "48px 20px", textAlign: "center" }}><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#0f8a5f", borderTopColor: "transparent" }} /></div></td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={8}><EmptyState icon={SearchX} title="No matching invoices" sub="Try a different search term." padding="48px 20px" /></td></tr>
                                ) : (
                                    filtered.map((r) => (
                                        <tr key={r.invId + r.date} className="clickable" onClick={() => openDetail(r)}>
                                            <td>
                                                <div className="cell-primary">{r.client.title} {r.client.name}</div>
                                                <div className="cell-sub tnum">{fmtDate(r.date)} · {r.code}</div>
                                            </td>
                                            <td className="tnum" style={{ fontWeight: 600, color: "var(--fg2)" }}>{r.invId}</td>
                                            <td><TypePill type={r.type} /></td>
                                            <td><MethodLabel method={r.method} /></td>
                                            <td style={{ fontWeight: 600 }}>{r.collectedBy}</td>
                                            <td><StageBadge stage={r.stage} /></td>
                                            <td className="num amount-green tnum">{fmtINR(r.amount)}</td>
                                            <td>
                                                <div style={{ display: "flex", gap: 7 }}>
                                                    <button className="row-action ghost" title="Open invoice" onClick={(e) => { e.stopPropagation(); openDetail(r) }}>
                                                        <Eye size={16} strokeWidth={2} />
                                                    </button>
                                                    <button className="row-action" title="Print invoice" onClick={(e) => { e.stopPropagation(); printDetail(r) }}>
                                                        <Printer size={16} strokeWidth={2} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {detail && (
                <div className="fin-inv-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
                    <div className="inv-shell">
                        <div className="inv-toolbar no-print">
                            <button className="btn btn-ghost" onClick={() => setDetail(null)}><ArrowLeft size={16} strokeWidth={2} />Back</button>
                            <div className="grow" style={{ flex: 1 }} />
                            <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} strokeWidth={2} />Print / Download PDF</button>
                        </div>
                        <InvoiceSheet inv={detail} />
                    </div>
                </div>
            )}
        </div>
    )
}

function InvoiceSheet({ inv }: { inv: InvoiceRow }) {
    const balance = inv.packageTotal - inv.collectedToDate
    const descLead = inv.type === "FULL" ? "Full package payment" : inv.type === "ADVANCE" ? "Advance payment" : "Balance payment"
    return (
        <div className="inv-sheet">
            <div className="inv-header">
                <div className="inv-brand">
                    <div className="mark"><LogoMark size={26} /></div>
                    <div>
                        <div className="bn">Outbound<span className="lt"> Travelers</span></div>
                        <div className="bs">Travel Management · Finance</div>
                    </div>
                </div>
                <div className="inv-meta">
                    <div className="inv-type"><TypePill type={inv.type} /></div>
                    <div className="inv-no tnum">{inv.invId}</div>
                    <div className="inv-date">Issued {fmtDate(inv.date)}</div>
                </div>
            </div>

            <div className="inv-label-row">
                <span className="inv-doc-label">Payment Receipt / Invoice</span>
            </div>

            <div className="inv-cols">
                <div className="inv-col">
                    <h4>Billed To</h4>
                    <div className="big">{inv.client.title} {inv.client.name}</div>
                    <div className="line"><Mail size={14} strokeWidth={2} />{inv.client.email}</div>
                    <div className="line"><Phone size={14} strokeWidth={2} />{inv.client.phone}</div>
                    <div className="line"><Hash size={14} strokeWidth={2} /><span className="tnum">{inv.code}</span></div>
                </div>
                <div className="inv-col">
                    <h4>Trip Details</h4>
                    <div className="big">{inv.destination}{inv.country ? `, ${inv.country}` : ""}</div>
                    <div className="line"><CalendarDays size={14} strokeWidth={2} />Travel date · {fmtDate(inv.travelDate)}</div>
                    <div className="line"><Moon size={14} strokeWidth={2} />Duration · {inv.duration}</div>
                    <div className="line"><Banknote size={14} strokeWidth={2} />Method · {inv.method}</div>
                </div>
            </div>

            <div className="inv-line-table">
                <table>
                    <thead>
                        <tr><th>Description</th><th>Source</th><th className="num">Amount</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="inv-line-desc">
                                <div className="d1">{descLead} — {inv.destination} {inv.duration}</div>
                                <div className="d2">Received {fmtDate(inv.date)} via {inv.method}</div>
                            </td>
                            <td><StageBadge stage={inv.stage} /></td>
                            <td className="num amount-green tnum" style={{ fontSize: 15 }}>{fmtINR(inv.amount)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="inv-summary">
                <div className="inv-summary-box">
                    <div className="inv-sum-row"><span className="lbl">Package Total</span><span className="val tnum">{fmtINR(inv.packageTotal)}</span></div>
                    <div className="inv-sum-row"><span className="lbl">Total Received</span><span className="val tnum" style={{ color: "var(--green)" }}>{fmtINR(inv.collectedToDate)}</span></div>
                    <div className="inv-sum-row total balance"><span className="lbl">Balance Due</span><span className="val tnum">{fmtINR(balance)}</span></div>
                </div>
            </div>

            {inv.evidence && inv.evidence !== "—" && (
                <div className="inv-evidence">
                    <div className="thumb"><ImageIcon size={26} strokeWidth={1.6} /></div>
                    <div className="em">
                        <div className="t">Payment Evidence</div>
                        <div className="f"><Paperclip size={15} strokeWidth={2} /><span className="tnum">{inv.evidence}</span></div>
                    </div>
                </div>
            )}

            <div className="inv-foot">
                <div className="inv-foot-grid">
                    <div className="inv-foot-item">
                        <div className="l">Collected By</div>
                        <div className="v"><UserRound size={14} strokeWidth={2} />{inv.collectedBy}</div>
                    </div>
                    <div className="inv-foot-item">
                        <div className="l">Verification</div>
                        <div className="v" style={{ color: inv.verification === "Verified" ? "var(--green)" : "var(--fg2)" }}>
                            {inv.verification === "Verified" ? <BadgeCheck size={14} strokeWidth={2} /> : <Clock size={14} strokeWidth={2} />}
                            {inv.verification}
                        </div>
                    </div>
                    <div className="inv-foot-item">
                        <div className="l">Generated On</div>
                        <div className="v"><CalendarCheck size={14} strokeWidth={2} />{fmtDate(new Date().toISOString())}</div>
                    </div>
                </div>
                <div className="inv-foot-note">
                    <ShieldCheck size={14} strokeWidth={2} />
                    This is a computer-generated invoice and does not require a physical signature.
                </div>
            </div>
        </div>
    )
}
