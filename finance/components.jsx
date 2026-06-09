/* =====================================================================
   Outbound Travelers — shared UI components
   ===================================================================== */

/* ---------- Icon (Lucide) ---------- */
function pascal(name) {
  return name.split("-").map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join("");
}
function Icon(props) {
  var name = props.name, size = props.size || 18, sw = props.sw || 2, className = props.className || "";
  var ref = React.useRef(null);
  React.useEffect(function () {
    var el = ref.current;
    if (!el || !window.lucide) return;
    var key = pascal(name);
    var node = (window.lucide.icons && window.lucide.icons[key]) || window.lucide[key];
    el.innerHTML = "";
    try {
      if (node && window.lucide.createElement) {
        var svg = window.lucide.createElement(node);
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.setAttribute("stroke-width", sw);
        el.appendChild(svg);
      } else {
        // fallback: data-lucide + global scan
        el.setAttribute("data-lucide", name);
        if (window.lucide.createIcons) window.lucide.createIcons();
      }
    } catch (e) { /* noop */ }
  }, [name, size, sw]);
  return React.createElement("span", { ref: ref, className: "lic " + className, style: { width: size, height: size } });
}

/* ---------- Logo mark (globe + plane) ---------- */
function LogoMark(props) {
  var size = props.size || 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" />
      <path d="M3 12h18" />
      <path d="M12 2.8c2.7 2.4 4.2 5.8 4.2 9.2s-1.5 6.8-4.2 9.2c-2.7-2.4-4.2-5.8-4.2-9.2S9.3 5.2 12 2.8Z" />
      <path d="M16.4 7.2l4.6-1.6-1.6 4.6" fill="none" />
    </svg>
  );
}

/* ---------- Status pill ---------- */
function StatusPill(props) {
  var s = props.status; // PAID | PARTIAL | UNPAID
  var cls = s === "PAID" ? "pill-paid" : s === "PARTIAL" ? "pill-partial" : "pill-unpaid";
  return <span className={"pill " + cls}><span className="dot" />{s}</span>;
}

/* ---------- Stage / source badge ---------- */
function StageBadge(props) {
  var stage = props.stage;
  if (!stage) return <span style={{ color: "var(--fg3)", fontSize: 12.5 }}>—</span>;
  var map = { "Sales": "stage-Sales", "Pre-Ops": "stage-PreOps", "Post-Ops": "stage-PostOps" };
  var ico = { "Sales": "handshake", "Pre-Ops": "clipboard-list", "Post-Ops": "plane-takeoff" };
  return <span className={"stage " + (map[stage] || "")}><Icon name={ico[stage] || "circle"} size={11} sw={2.2} />{stage}</span>;
}

/* ---------- Type pill (ADVANCE/BALANCE/FULL) ---------- */
function TypePill(props) {
  return <span className={"type-pill type-" + props.type}>{props.type}</span>;
}

/* ---------- Verification ---------- */
function VerifyBadge(props) {
  var v = props.verification;
  return (
    <span className={"verify verify-" + v}>
      <Icon name={v === "Verified" ? "badge-check" : "clock"} size={14} sw={2.2} />{v}
    </span>
  );
}

/* ---------- SLA badge ---------- */
function SLABadge(props) {
  var sla = props.sla;
  if (!sla) return null;
  return (
    <span className={"sla sla-" + sla.tone}>
      <Icon name={sla.overdue ? "alarm-clock" : "clock-3"} size={12} sw={2.2} />{sla.text}
    </span>
  );
}

/* ---------- Method ---------- */
function MethodLabel(props) {
  var m = props.method;
  var ico = { "Bank Transfer": "landmark", "UPI": "smartphone", "Cash": "banknote" };
  return <span className="method"><Icon name={ico[m] || "credit-card"} size={15} sw={2} />{m}</span>;
}

/* ---------- Progress bar ---------- */
function Progress(props) {
  var pct = Math.max(0, Math.min(100, props.pct || 0));
  var tone = props.tone || "";
  return <div className={"progress " + tone + (props.mini ? " mini" : "")}><span style={{ width: pct + "%" }} /></div>;
}

/* ---------- Metric card ---------- */
function MetricCard(props) {
  var accent = props.accent; // 'green' | 'amber' | 'red' | 'primary'
  var colors = {
    green:   { c: "var(--green)", bg: "var(--green-bg)" },
    amber:   { c: "var(--amber)", bg: "var(--amber-bg)" },
    red:     { c: "var(--red)",   bg: "var(--red-bg)" },
    primary: { c: "var(--primary)", bg: "var(--primary-tint)" }
  }[accent] || { c: "var(--primary)", bg: "var(--primary-tint)" };
  return (
    <div className="metric" style={{ "--accent": colors.c, "--accent-bg": colors.bg }}>
      <div className="metric-top">
        <div className="metric-ico"><Icon name={props.icon} size={19} sw={2} /></div>
        <div className="metric-label">{props.label}</div>
      </div>
      <div className={"metric-value tnum" + (props.count ? " count" : "")}>{props.value}</div>
      {props.foot ? <div className="metric-foot">{props.foot}</div> : null}
    </div>
  );
}

/* ---------- Search ---------- */
function Search(props) {
  return (
    <div className="search" style={props.style}>
      <Icon name="search" size={17} sw={2} />
      <input
        value={props.value}
        onChange={function (e) { props.onChange(e.target.value); }}
        placeholder={props.placeholder || "Search…"}
      />
    </div>
  );
}

/* ---------- Sidebar ---------- */
var NAV_MAIN = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "kpi", label: "KPI Analytics", icon: "chart-no-axes-combined" },
  { id: "pipeline", label: "Pipeline", icon: "git-branch" },
  { id: "tasks", label: "Pending Tasks", icon: "list-checks", count: 7 },
  { id: "users", label: "Users", icon: "users" },
  { id: "customers", label: "Customers", icon: "contact-round" },
  { id: "sops", label: "SOPs", icon: "book-open-text" },
  { id: "destinations", label: "Destinations", icon: "map-pin" },
  { id: "itinerary", label: "Itinerary Generators", icon: "route" },
  { id: "settings", label: "Settings", icon: "settings" }
];
var NAV_FINANCE = [
  { id: "finance-dashboard", label: "Finance Dashboard", icon: "wallet" },
  { id: "finance-payments", label: "Finance Payments", icon: "hand-coins" },
  { id: "finance-invoices", label: "Finance Invoices", icon: "receipt-text" }
];

function Sidebar(props) {
  var view = props.view, go = props.go, user = window.OBT.USER, mobileOpen = props.mobileOpen;
  function Item(it) {
    var active = view === it.id || (it.id === "finance-invoices" && view === "invoice-detail");
    return (
      <button key={it.id} className={"sb-item" + (active ? " active" : "")} onClick={function () { go(it.id); }}>
        <Icon name={it.icon} size={18} sw={2} />
        <span>{it.label}</span>
        {it.count ? <span className="badge-count tnum">{it.count}</span> : null}
      </button>
    );
  }
  return (
    <aside className={"sidebar" + (mobileOpen ? " mobile-open" : "")}>
      <div className="sb-brand">
        <div className="sb-logo-mark"><LogoMark size={21} /></div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">Outbound<span className="lt"> Travelers</span></div>
          <div className="sb-brand-sub">Travel Management</div>
        </div>
      </div>

      <div className="sb-role">
        <Icon name="shield-check" size={15} sw={2} />
        {user.role}
      </div>

      <nav className="sb-nav">
        {NAV_MAIN.map(Item)}
        <div className="sb-group-label">Finance</div>
        {NAV_FINANCE.map(Item)}
      </nav>

      <div className="sb-user">
        <div className="sb-avatar">{user.initials}</div>
        <div className="sb-user-meta">
          <div className="sb-user-name">{user.name}</div>
          <div className="sb-user-mail">{user.email}</div>
        </div>
        <Icon name="chevron-up" size={16} sw={2} className="chev" />
      </div>
    </aside>
  );
}

/* ---------- Placeholder (non-finance modules) ---------- */
function PlaceholderPage(props) {
  return (
    <div className="placeholder-page">
      <div className="pp-ico"><Icon name={props.icon} size={32} sw={1.8} /></div>
      <h2>{props.title}</h2>
      <p>This module sits outside the Finance prototype. The Finance Dashboard, Payments and Invoices screens are fully interactive.</p>
      <div className="tag">Prototype scope · Finance module</div>
    </div>
  );
}

Object.assign(window, {
  Icon: Icon, LogoMark: LogoMark, StatusPill: StatusPill, StageBadge: StageBadge,
  TypePill: TypePill, VerifyBadge: VerifyBadge, SLABadge: SLABadge, MethodLabel: MethodLabel,
  Progress: Progress, MetricCard: MetricCard, Search: Search, Sidebar: Sidebar,
  PlaceholderPage: PlaceholderPage, NAV_MAIN: NAV_MAIN, NAV_FINANCE: NAV_FINANCE
});
