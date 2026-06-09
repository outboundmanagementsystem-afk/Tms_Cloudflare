/* =====================================================================
   Screen 1 — Finance Dashboard
   ===================================================================== */

function FinanceDashboard(props) {
  var derived = props.derived, go = props.go, openBooking = props.openBooking, user = window.OBT.USER;
  var fmt = window.OBT.fmtINR;
  var t = window.OBT.totals(derived);
  var search = props.search;

  // bookings that still need collection (balance > 0), worst SLA / biggest balance first
  var needs = derived.filter(function (b) { return b.balance > 0; });
  if (search) {
    var q = search.toLowerCase();
    needs = needs.filter(function (b) {
      return (b.client.name + " " + b.destination + " " + b.code).toLowerCase().indexOf(q) >= 0;
    });
  }
  needs.sort(function (a, b) {
    var ao = a.sla && a.sla.overdue ? 1 : 0, bo = b.sla && b.sla.overdue ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return b.balance - a.balance;
  });
  var shown = needs.slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">Finance Dashboard</h1>
          <p className="page-sub">Welcome, {user.first}</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={function () { go("finance-payments"); }}>
            <Icon name="hand-coins" size={17} sw={2} />Manage Payments
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 420, marginBottom: 26 }}>
        <Search value={props.search} onChange={props.setSearch} placeholder="Search clients, destinations, booking codes…" />
      </div>

      {/* Money metrics */}
      <div className="metric-grid">
        <MetricCard accent="primary" icon="layers" label="Total Package Value"
          value={fmt(t.value)} foot={<span><Icon name="briefcase" size={13} sw={2} />{derived.length} active bookings</span>} />
        <MetricCard accent="green" icon="trending-up" label="Total Collected"
          value={fmt(t.collected)} foot={<span><Icon name="circle-check-big" size={13} sw={2} />{t.value > 0 ? Math.round(t.collected / t.value * 100) : 0}% of package value</span>} />
        <MetricCard accent="red" icon="hourglass" label="Pending Balance"
          value={fmt(t.balance)} foot={<span><Icon name="alarm-clock" size={13} sw={2} />{needs.length} bookings awaiting collection</span>} />
      </div>

      {/* Count metrics */}
      <div className="metric-grid">
        <MetricCard accent="green" icon="circle-check-big" label="Fully Paid" count
          value={String(t.paid)} foot="Balance cleared in full" />
        <MetricCard accent="amber" icon="circle-dashed" label="Partial Payment" count
          value={String(t.partial)} foot="Advance received, balance due" />
        <MetricCard accent="red" icon="circle-x" label="No Payment Yet" count
          value={String(t.unpaid)} foot="Awaiting first collection" />
      </div>

      {/* Requires payment collection */}
      <div className="section-head">
        <div className="section-title">Requires Payment Collection</div>
        <div className="grow" />
        <button className="link-btn" onClick={function () { go("finance-payments"); }}>
          View all<Icon name="arrow-right" size={15} sw={2.2} />
        </button>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {shown.length === 0 ? (
          <div className="empty-state" style={{ padding: "52px 24px" }}>
            <div className="es-ico"><Icon name="party-popper" size={26} sw={1.8} /></div>
            <div className="es-title">All caught up</div>
            <div className="es-sub">No outstanding balances match your search.</div>
          </div>
        ) : shown.map(function (b) {
          return (
            <div className="coll-row" key={b.id} onClick={function () { openBooking(b.id); }}>
              <div className="coll-avatar">{b.client.name.charAt(0)}</div>
              <div className="coll-id">
                <div className="coll-name">
                  {b.client.title} {b.client.name}
                  <StageBadge stage={b.latestStage} />
                </div>
                <div className="coll-meta">{b.destination} · {b.code} · {b.duration}</div>
              </div>
              <div className="coll-prog">
                <div className="coll-prog-top">
                  <span className="pct tnum">{b.percent}% collected</span>
                  <span className="amt tnum">{fmt(b.collected)} / {fmt(b.total)}</span>
                </div>
                <Progress pct={b.percent} tone={b.percent === 0 ? "red" : "amber"} />
              </div>
              <div className="coll-balance">
                <div className="lbl">Balance due</div>
                <div className="val tnum">{fmt(b.balance)}</div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                  <SLABadge sla={b.sla} />
                </div>
              </div>
              <Icon name="chevron-right" size={20} sw={2} className="coll-chev" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { FinanceDashboard: FinanceDashboard });
