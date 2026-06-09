/* =====================================================================
   Outbound Travelers — Finance module · App shell
   Single ledger state; every screen is a derived view over it.
   ===================================================================== */

function useIcons(dep) {
  React.useEffect(function () {
    if (window.lucide && window.lucide.createIcons) {
      // refresh any data-lucide fallbacks; the Icon component manages its own.
    }
  });
}

var NAV_TITLES = {};
window.NAV_MAIN.concat(window.NAV_FINANCE).forEach(function (n) { NAV_TITLES[n.id] = n.label; });

function App() {
  var s0 = React.useState("finance-dashboard"); var view = s0[0], setView = s0[1];
  // the ledger: raw bookings (mutable copy)
  var s1 = React.useState(function () { return JSON.parse(JSON.stringify(window.OBT.BOOKINGS)); });
  var bookings = s1[0], setBookings = s1[1];

  var s2 = React.useState({ id: null, open: false, focusRecord: false });
  var drawer = s2[0], setDrawer = s2[1];

  var s3 = React.useState(null); var invoiceId = s3[0], setInvoiceId = s3[1];

  // searches per screen
  var sDash = React.useState(""); var sPay = React.useState(""); var sInv = React.useState("");
  var sFilter = React.useState("all");

  var sMobile = React.useState(false); var mobileOpen = sMobile[0], setMobileOpen = sMobile[1];
  var sToast = React.useState(""); var toast = sToast[0], setToast = sToast[1];

  var derived = window.OBT.deriveAll(bookings);
  var invoices = window.OBT.buildInvoices(bookings);

  function go(id) {
    setView(id);
    setMobileOpen(false);
    if (id !== "invoice-detail") setInvoiceId(null);
    document.querySelector(".scroll-area") && (document.querySelector(".scroll-area").scrollTop = 0);
  }

  function openBooking(id) { setDrawer({ id: id, open: true, focusRecord: false }); }
  function openRecord(id) { setDrawer({ id: id, open: true, focusRecord: true }); }
  function closeDrawer() { setDrawer(function (d) { return Object.assign({}, d, { open: false }); }); }

  function recordPayment(bookingId, payment) {
    setBookings(function (prev) {
      return prev.map(function (b) {
        if (b.id !== bookingId) return b;
        return Object.assign({}, b, { payments: (b.payments || []).concat([payment]) });
      });
    });
    flash("Payment of " + window.OBT.fmtINR(payment.amount) + " recorded");
  }

  function flash(msg) {
    setToast(msg);
    clearTimeout(window.__obtToast);
    window.__obtToast = setTimeout(function () { setToast(""); }, 2600);
  }

  function openInvoice(invId) { setInvoiceId(invId); setView("invoice-detail"); var sa = document.querySelector(".scroll-area"); if (sa) sa.scrollTop = 0; }
  function printInvoice(invId) { setInvoiceId(invId); setView("invoice-detail"); setTimeout(function () { window.print(); }, 200); }

  var drawerBooking = drawer.id ? derived.filter(function (b) { return b.id === drawer.id; })[0] : null;
  var currentInvoice = invoiceId ? invoices.filter(function (r) { return r.invId === invoiceId; })[0] : null;

  // breadcrumb
  var crumb = view === "invoice-detail" ? "Invoice " + (invoiceId || "") : (NAV_TITLES[view] || "Dashboard");
  var section = view.indexOf("finance") === 0 || view === "invoice-detail" ? "Finance" : "Workspace";

  function renderScreen() {
    switch (view) {
      case "finance-dashboard":
        return <FinanceDashboard derived={derived} go={go} openBooking={openBooking}
          search={sDash[0]} setSearch={sDash[1]} />;
      case "finance-payments":
        return <PaymentsScreen derived={derived} openBooking={openBooking} openRecord={openRecord}
          search={sPay[0]} setSearch={sPay[1]} filter={sFilter[0]} setFilter={sFilter[1]} />;
      case "finance-invoices":
        return <InvoicesScreen invoices={invoices} openInvoice={openInvoice} printInvoice={printInvoice}
          search={sInv[0]} setSearch={sInv[1]} />;
      case "invoice-detail":
        return <InvoiceDetail invoice={currentInvoice} back={function () { go("finance-invoices"); }} />;
      default:
        var meta = window.NAV_MAIN.filter(function (n) { return n.id === view; })[0] || { label: "Module", icon: "layout-dashboard" };
        return <PlaceholderPage title={meta.label} icon={meta.icon} />;
    }
  }

  return (
    <div className="app">
      <Sidebar view={view} go={go} mobileOpen={mobileOpen} />
      {mobileOpen ? <div className="scrim open no-print" style={{ zIndex: 70 }} onClick={function () { setMobileOpen(false); }} /> : null}

      <div className="app-main">
        <div className="topbar no-print">
          <button className="icon-btn hamburger" onClick={function () { setMobileOpen(true); }}>
            <Icon name="menu" size={19} sw={2} />
          </button>
          <div className="topbar-crumbs">
            <span>{section}</span>
            <Icon name="chevron-right" size={14} sw={2} className="sep" />
            <span className="cur">{crumb}</span>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-search">
            <Search
              value={view === "finance-payments" ? sPay[0] : view === "finance-invoices" ? sInv[0] : sDash[0]}
              onChange={view === "finance-payments" ? sPay[1] : view === "finance-invoices" ? sInv[1] : sDash[1]}
              placeholder="Search…" />
          </div>
          <button className="icon-btn" title="Notifications"><Icon name="bell" size={18} sw={2} /></button>
          <button className="icon-btn" title="Help"><Icon name="circle-help" size={18} sw={2} /></button>
        </div>

        <div className="scroll-area">
          {renderScreen()}
        </div>
      </div>

      <PaymentDrawer booking={drawerBooking} open={drawer.open} focusRecord={drawer.focusRecord}
        onClose={closeDrawer} onRecord={recordPayment} />

      <div className={"toast" + (toast ? " show" : "")}>
        <Icon name="circle-check-big" size={17} sw={2.2} />{toast}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
