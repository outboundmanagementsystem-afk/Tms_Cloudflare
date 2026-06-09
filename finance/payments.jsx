/* =====================================================================
   Screen 2 — Payments (per booking) + payment drawer + record form
   ===================================================================== */

var FILTERS = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "partial", label: "Partial" },
  { id: "paid", label: "Fully Paid" }
];

function PaymentsScreen(props) {
  var derived = props.derived, openBooking = props.openBooking;
  var fmt = window.OBT.fmtINR;
  var search = props.search, setSearch = props.setSearch;
  var filter = props.filter, setFilter = props.setFilter;

  function matchFilter(b) {
    if (filter === "unpaid") return b.status === "UNPAID";
    if (filter === "partial") return b.status === "PARTIAL";
    if (filter === "paid") return b.status === "PAID";
    return true;
  }
  var counts = {
    all: derived.length,
    unpaid: derived.filter(function (b) { return b.status === "UNPAID"; }).length,
    partial: derived.filter(function (b) { return b.status === "PARTIAL"; }).length,
    paid: derived.filter(function (b) { return b.status === "PAID"; }).length
  };

  var rows = derived.filter(matchFilter);
  if (search) {
    var q = search.toLowerCase();
    rows = rows.filter(function (b) {
      return (b.client.name + " " + b.destination + " " + b.code).toLowerCase().indexOf(q) >= 0;
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">Manage all client payments and balances</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="chips">
          {FILTERS.map(function (f) {
            return (
              <button key={f.id} className={"chip" + (filter === f.id ? " active" : "")} onClick={function () { setFilter(f.id); }}>
                {f.label}<span className="ct tnum">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="grow" style={{ flex: 1 }} />
        <Search value={search} onChange={setSearch} placeholder="Search payments…" style={{ width: 300 }} />
      </div>

      <div className="card table-card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Destination</th>
                <th className="num">Total</th>
                <th style={{ width: 180 }}>Collected</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th style={{ width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="7">
                  <div className="empty-state" style={{ padding: "48px 20px" }}>
                    <div className="es-ico"><Icon name="search-x" size={26} sw={1.8} /></div>
                    <div className="es-title">No matching bookings</div>
                    <div className="es-sub">Try a different search term or filter.</div>
                  </div>
                </td></tr>
              ) : rows.map(function (b) {
                return (
                  <tr key={b.id} className="clickable" onClick={function () { openBooking(b.id); }}>
                    <td>
                      <div className="cell-primary">{b.client.title} {b.client.name}</div>
                      <div className="cell-sub tnum">{b.code}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.destination}</div>
                      <div className="cell-sub">{b.duration}</div>
                    </td>
                    <td className="num amount-strong tnum">{fmt(b.total)}</td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
                        <span className="tnum" style={{ color: "var(--fg2)" }}>{fmt(b.collected)}</span>
                        <span className="tnum" style={{ color: "var(--fg3)" }}>{b.percent}%</span>
                      </div>
                      <Progress pct={b.percent} mini tone={b.status === "PAID" ? "green" : b.percent === 0 ? "red" : "amber"} />
                    </td>
                    <td className="num tnum">
                      {b.balance > 0 ? <span className="amount-red">{fmt(b.balance)}</span> : <span style={{ color: "var(--fg3)" }}>{fmt(0)}</span>}
                    </td>
                    <td><StatusPill status={b.status} /></td>
                    <td className="num">
                      <button className="row-action" title="Record payment"
                        onClick={function (e) { e.stopPropagation(); props.openRecord(b.id); }}>
                        <Icon name="plus" size={17} sw={2.4} />
                      </button>
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

/* ---------- Payment drawer ---------- */
function PaymentDrawer(props) {
  var b = props.booking; // derived booking or null
  var open = props.open;
  var fmt = window.OBT.fmtINR, fmtDate = window.OBT.fmtDate;
  var focusRecord = props.focusRecord;

  // ledger sorted newest first
  var ledger = b ? (b.payments || []).slice().sort(function (x, y) {
    return new Date(y.date) - new Date(x.date);
  }) : [];

  return (
    <React.Fragment>
      <div className={"scrim" + (open ? " open" : "")} onClick={props.onClose} />
      <div className={"drawer" + (open ? " open" : "")}>
        {b ? (
          <React.Fragment>
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
                <button className="icon-btn drawer-close no-print" onClick={props.onClose}>
                  <Icon name="x" size={18} sw={2.2} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <StatusPill status={b.status} />
                <SLABadge sla={b.sla} />
                <div className="grow" style={{ flex: 1 }} />
                <span style={{ fontSize: 12.5, color: "var(--fg3)", fontWeight: 600 }}>
                  Travel {fmtDate(b.travelDate)}
                </span>
              </div>
            </div>

            <div className="drawer-body">
              <div className="summary-3">
                <div>
                  <div className="lbl">Package Total</div>
                  <div className="val tnum" style={{ color: "var(--fg1)" }}>{fmt(b.total)}</div>
                </div>
                <div>
                  <div className="lbl">Collected</div>
                  <div className="val tnum" style={{ color: "var(--green)" }}>{fmt(b.collected)}</div>
                </div>
                <div>
                  <div className="lbl">Balance Due</div>
                  <div className="val tnum" style={{ color: b.balance > 0 ? "var(--red)" : "var(--fg3)" }}>{fmt(b.balance)}</div>
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
                <span className="grow" style={{ flex: 1 }} />
                <span className="n tnum">{ledger.length} record{ledger.length === 1 ? "" : "s"}</span>
              </div>

              {ledger.length === 0 ? (
                <div className="ledger-empty">
                  <Icon name="receipt" size={30} sw={1.6} />
                  <div className="t">No payments yet</div>
                  <div className="s">Record the first collection below.</div>
                </div>
              ) : ledger.map(function (p, i) {
                return (
                  <div className="ledger-item" key={i}>
                    <div className="ledger-item-top">
                      <div className="ledger-amt tnum">{fmt(p.amount)}</div>
                      <TypePill type={p.type} />
                      <div className="grow" style={{ flex: 1 }} />
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
                      <Icon name="user-round" size={13} sw={2} />Collected by {p.collectedBy}
                    </div>
                  </div>
                );
              })}

              <RecordPaymentForm booking={b} autoFocus={focusRecord} onRecord={props.onRecord} />
            </div>
          </React.Fragment>
        ) : null}
      </div>
    </React.Fragment>
  );
}

/* ---------- Record payment form ---------- */
var METHODS = [
  { id: "Bank Transfer", icon: "landmark" },
  { id: "UPI", icon: "smartphone" },
  { id: "Cash", icon: "banknote" }
];
var STAGES = ["Sales", "Pre-Ops", "Post-Ops"];

function RecordPaymentForm(props) {
  var b = props.booking;
  var fmt = window.OBT.fmtINR;
  var todayISO = "2026-05-29";
  var defaultType = b.collected <= 0 ? "ADVANCE" : "BALANCE";

  var st = React.useState({
    amount: "", method: "Bank Transfer", stage: "Sales",
    collectedBy: window.OBT.USER.name, date: todayISO, type: defaultType, verified: false
  });
  var f = st[0], set = st[1];
  var ref = React.useRef(null);

  React.useEffect(function () {
    if (props.autoFocus && ref.current) {
      setTimeout(function () { try { ref.current.focus(); } catch (e) {} }, 340);
    }
  }, [props.autoFocus, b.id]);

  function upd(k, v) { set(Object.assign({}, f, (function () { var o = {}; o[k] = v; return o; })())); }

  var amt = Number(f.amount) || 0;
  var willClear = amt >= b.balance && amt > 0;
  var over = amt > b.balance && b.balance > 0;

  function submit(e) {
    e.preventDefault();
    if (amt <= 0) return;
    props.onRecord(b.id, {
      date: f.date, amount: amt, method: f.method, stage: f.stage,
      collectedBy: f.collectedBy, verification: f.verified ? "Verified" : "Recorded",
      type: willClear && b.collected <= 0 ? "FULL" : f.type
    });
    set(Object.assign({}, f, { amount: "", verified: false }));
  }

  if (b.balance <= 0) {
    return (
      <div className="form-card" style={{ textAlign: "center" }}>
        <div style={{ color: "var(--green)", marginBottom: 8 }}><Icon name="circle-check-big" size={28} sw={1.8} /></div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Balance fully collected</div>
        <div style={{ color: "var(--fg2)", fontSize: 13, marginTop: 4 }}>This booking has no outstanding balance.</div>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="fc-title"><Icon name="plus-circle" size={18} sw={2} />Record Payment</div>

      <div className="field-row">
        <div className="field">
          <label>Amount (₹)</label>
          <div className="inp-wrap">
            <span className="prefix">₹</span>
            <input ref={ref} className="inp with-prefix tnum" type="number" min="1" inputMode="numeric"
              placeholder="0" value={f.amount} onChange={function (e) { upd("amount", e.target.value); }} />
          </div>
        </div>
        <div className="field">
          <label>Date</label>
          <input className="inp" type="date" value={f.date} onChange={function (e) { upd("date", e.target.value); }} />
        </div>
      </div>

      <div className="field">
        <label>Payment Method</label>
        <div className="seg">
          {METHODS.map(function (m) {
            return (
              <button type="button" key={m.id} className={f.method === m.id ? "on" : ""} onClick={function () { upd("method", m.id); }}>
                <Icon name={m.icon} size={14} sw={2} />{m.id}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label>Collection Stage</label>
        <div className="seg">
          {STAGES.map(function (s) {
            return (
              <button type="button" key={s} className={f.stage === s ? "on" : ""} onClick={function () { upd("stage", s); }}>{s}</button>
            );
          })}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Collected By</label>
          <input className="inp" value={f.collectedBy} onChange={function (e) { upd("collectedBy", e.target.value); }} />
        </div>
        <div className="field">
          <label>Verification</label>
          <button type="button" className={"inp"} style={{
            display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start",
            color: f.verified ? "var(--green)" : "var(--fg2)", fontWeight: 700, cursor: "pointer"
          }} onClick={function () { upd("verified", !f.verified); }}>
            <Icon name={f.verified ? "badge-check" : "clock"} size={16} sw={2.2} />
            {f.verified ? "Verified" : "Recorded"}
          </button>
        </div>
      </div>

      {amt > 0 ? (
        <div style={{
          fontSize: 12.5, fontWeight: 600, margin: "2px 0 12px",
          color: over ? "var(--amber)" : willClear ? "var(--green)" : "var(--fg2)",
          display: "flex", alignItems: "center", gap: 6
        }}>
          <Icon name={over ? "triangle-alert" : willClear ? "circle-check-big" : "info"} size={14} sw={2} />
          {over ? "Exceeds balance — booking will be marked fully paid."
            : willClear ? "Clears the balance — booking becomes Fully Paid."
              : "Remaining balance after this: " + fmt(b.balance - amt)}
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={amt <= 0}>
        <Icon name="check" size={17} sw={2.4} />Record {amt > 0 ? fmt(amt) : "Payment"}
      </button>
    </form>
  );
}

Object.assign(window, { PaymentsScreen: PaymentsScreen, PaymentDrawer: PaymentDrawer });
