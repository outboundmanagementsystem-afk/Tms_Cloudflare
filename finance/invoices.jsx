/* =====================================================================
   Screen 3 — Invoices (one row per payment event)
   Screen 4 — Printable invoice detail
   ===================================================================== */

function InvoicesScreen(props) {
  var invoices = props.invoices, openInvoice = props.openInvoice;
  var fmt = window.OBT.fmtINR, fmtDate = window.OBT.fmtDate;
  var search = props.search, setSearch = props.setSearch;

  var rows = invoices;
  if (search) {
    var q = search.toLowerCase();
    rows = rows.filter(function (r) {
      return (r.client.name + " " + r.code + " " + r.invId + " " + r.collectedBy + " " + r.destination).toLowerCase().indexOf(q) >= 0;
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">All payment records and invoices</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, color: "var(--fg2)", fontWeight: 600 }}>
          <span className="tnum" style={{ color: "var(--fg1)", fontWeight: 800 }}>{rows.length}</span> payment record{rows.length === 1 ? "" : "s"}
        </div>
        <div className="grow" style={{ flex: 1 }} />
        <Search value={search} onChange={setSearch} placeholder="Search by client, invoice no, code…" style={{ width: 320 }} />
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
              {rows.length === 0 ? (
                <tr><td colSpan="8">
                  <div className="empty-state" style={{ padding: "48px 20px" }}>
                    <div className="es-ico"><Icon name="search-x" size={26} sw={1.8} /></div>
                    <div className="es-title">No matching invoices</div>
                    <div className="es-sub">Try a different search term.</div>
                  </div>
                </td></tr>
              ) : rows.map(function (r) {
                return (
                  <tr key={r.invId} className="clickable" onClick={function () { openInvoice(r.invId); }}>
                    <td>
                      <div className="cell-primary">{r.client.title} {r.client.name}</div>
                      <div className="cell-sub tnum">{fmtDate(r.date)} · {r.code}</div>
                    </td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--fg2)" }}>{r.invId}</td>
                    <td><TypePill type={r.type} /></td>
                    <td><MethodLabel method={r.method} /></td>
                    <td style={{ fontWeight: 600 }}>{r.collectedBy}</td>
                    <td><StageBadge stage={r.stage} /></td>
                    <td className="num amount-green tnum">{fmt(r.amount)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 7 }}>
                        <button className="row-action ghost" title="Open invoice" onClick={function (e) { e.stopPropagation(); openInvoice(r.invId); }}>
                          <Icon name="eye" size={16} sw={2} />
                        </button>
                        <button className="row-action" title="Print invoice" onClick={function (e) { e.stopPropagation(); props.printInvoice(r.invId); }}>
                          <Icon name="printer" size={16} sw={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Screen 4 — Invoice detail (printable) ---------- */
function InvoiceDetail(props) {
  var inv = props.invoice;
  var fmt = window.OBT.fmtINR, fmtDate = window.OBT.fmtDate;
  if (!inv) {
    return (
      <div className="page">
        <div className="empty-state" style={{ padding: "80px 24px" }}>
          <div className="es-ico"><Icon name="file-x" size={26} sw={1.8} /></div>
          <div className="es-title">Invoice not found</div>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={props.back}><Icon name="arrow-left" size={16} sw={2} />Back to invoices</button>
        </div>
      </div>
    );
  }
  var balance = inv.packageTotal - inv.collectedToDate;

  return (
    <div className="page">
      <div className="inv-toolbar no-print">
        <button className="btn btn-ghost" onClick={props.back}><Icon name="arrow-left" size={16} sw={2} />Back</button>
        <div className="grow" style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={function () { window.print(); }}><Icon name="eye" size={16} sw={2} />Preview</button>
        <button className="btn btn-primary" onClick={function () { window.print(); }}><Icon name="printer" size={16} sw={2} />Print / Download PDF</button>
      </div>

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
            <div className="line"><Icon name="mail" size={14} sw={2} />{inv.client.email}</div>
            <div className="line"><Icon name="phone" size={14} sw={2} />{inv.client.phone}</div>
            <div className="line"><Icon name="hash" size={14} sw={2} /><span className="tnum">{inv.code}</span></div>
          </div>
          <div className="inv-col">
            <h4>Trip Details</h4>
            <div className="big">{inv.destination}, {inv.country}</div>
            <div className="line"><Icon name="calendar-days" size={14} sw={2} />Travel date · {fmtDate(inv.travelDate)}</div>
            <div className="line"><Icon name="moon" size={14} sw={2} />Duration · {inv.duration}</div>
            <div className="line"><Icon name="banknote" size={14} sw={2} />Method · {inv.method}</div>
          </div>
        </div>

        <div className="inv-line-table">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Source</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="inv-line-desc">
                  <div className="d1">{inv.type === "FULL" ? "Full package payment" : inv.type === "ADVANCE" ? "Advance payment" : "Balance payment"} — {inv.destination} {inv.duration}</div>
                  <div className="d2">Received {fmtDate(inv.date)} via {inv.method}</div>
                </td>
                <td><StageBadge stage={inv.stage} /></td>
                <td className="num amount-green tnum" style={{ fontSize: 15 }}>{fmt(inv.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="inv-summary">
          <div className="inv-summary-box">
            <div className="inv-sum-row">
              <span className="lbl">Package Total</span>
              <span className="val tnum">{fmt(inv.packageTotal)}</span>
            </div>
            <div className="inv-sum-row">
              <span className="lbl">Total Received</span>
              <span className="val tnum" style={{ color: "var(--green)" }}>{fmt(inv.collectedToDate)}</span>
            </div>
            <div className="inv-sum-row total balance">
              <span className="lbl">Balance Due</span>
              <span className="val tnum">{fmt(balance)}</span>
            </div>
          </div>
        </div>

        <div className="inv-evidence">
          <div className="thumb"><Icon name="image" size={26} sw={1.6} /></div>
          <div className="em">
            <div className="t">Payment Evidence</div>
            <div className="f"><Icon name="paperclip" size={15} sw={2} /><span className="tnum">{inv.evidence}</span></div>
          </div>
        </div>

        <div className="inv-foot">
          <div className="inv-foot-grid">
            <div className="inv-foot-item">
              <div className="l">Collected By</div>
              <div className="v"><Icon name="user-round" size={14} sw={2} />{inv.collectedBy}</div>
            </div>
            <div className="inv-foot-item">
              <div className="l">Verification</div>
              <div className="v" style={{ color: inv.verification === "Verified" ? "var(--green)" : "var(--fg2)" }}>
                <Icon name={inv.verification === "Verified" ? "badge-check" : "clock"} size={14} sw={2} />{inv.verification}
              </div>
            </div>
            <div className="inv-foot-item">
              <div className="l">Generated On</div>
              <div className="v"><Icon name="calendar-check" size={14} sw={2} />{fmtDate("2026-05-29")}</div>
            </div>
          </div>
          <div className="inv-foot-note">
            <Icon name="shield-check" size={14} sw={2} />
            This is a computer-generated invoice and does not require a physical signature.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { InvoicesScreen: InvoicesScreen, InvoiceDetail: InvoiceDetail });
