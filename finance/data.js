/* =====================================================================
   Outbound Travelers — Finance module data layer
   One payments ledger is the single source of truth.
   collected / balance / status / SLA are always DERIVED, never typed twice.
   ===================================================================== */

(function () {
  "use strict";

  /* ---------- Currency: Indian grouping, never NaN ---------- */
  // fmtINR(38_33_722) -> "₹38,33,722" ; fmtINR(0) -> "₹0" ; fmtINR(null) -> "—"
  function fmtINR(n) {
    if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
    var v = Math.round(Number(n));
    var grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(v));
    return (v < 0 ? "-₹" : "₹") + grouped;
  }
  // plain grouped number without symbol
  function grp(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return "—";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));
  }

  /* ---------- Dates ---------- */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TODAY = new Date("2026-05-29T00:00:00");

  function parse(iso) { return new Date(iso + "T00:00:00"); }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = parse(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtDateShort(iso) {
    if (!iso) return "—";
    var d = parse(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ---------- Sample bookings (realistic Indian travel-agency data) ---------- */
  // Each payment event: { date, amount, method, stage, collectedBy, verification, type, evidence }
  //   method:       "Bank Transfer" | "UPI" | "Cash"
  //   stage:        "Sales" | "Pre-Ops" | "Post-Ops"   (where the money was collected)
  //   verification: "Verified" | "Recorded"
  //   type:         "ADVANCE" | "BALANCE" | "FULL"
  var BOOKINGS = [
    {
      id: "bk-101", code: "OBT-24187",
      client: { title: "Mr.", name: "Dummy Test Client", email: "dummy.client@example.com", phone: "+91 98201 44512" },
      destination: "Kashmir", country: "India", duration: "3N/4D",
      bookingDate: "2026-05-18", travelDate: "2026-06-14", balanceDueDate: "2026-06-02",
      total: 9775,
      payments: [
        { date: "2026-05-20", amount: 3000, method: "UPI", stage: "Sales", collectedBy: "Aman Gupta", verification: "Verified", type: "ADVANCE", evidence: "upi-ref-8841.jpg" }
      ]
    },
    {
      id: "bk-102", code: "OBT-24166",
      client: { title: "Mrs.", name: "Ananya Iyer", email: "ananya.iyer@example.com", phone: "+91 99012 88210" },
      destination: "Bali", country: "Indonesia", duration: "5N/6D",
      bookingDate: "2026-03-04", travelDate: "2026-05-09", balanceDueDate: "2026-04-25",
      total: 185000,
      payments: [
        { date: "2026-03-10", amount: 60000, method: "Bank Transfer", stage: "Sales", collectedBy: "Aman Gupta", verification: "Verified", type: "ADVANCE", evidence: "neft-advice.pdf" },
        { date: "2026-04-22", amount: 125000, method: "Bank Transfer", stage: "Pre-Ops", collectedBy: "Neha Verma", verification: "Verified", type: "BALANCE", evidence: "neft-advice-2.pdf" }
      ]
    },
    {
      id: "bk-103", code: "OBT-24142",
      client: { title: "Mr.", name: "Rajesh Kumar", email: "rajesh.kumar@example.com", phone: "+91 98330 17765" },
      destination: "Maldives", country: "Maldives", duration: "4N/5D",
      bookingDate: "2026-04-11", travelDate: "2026-06-22", balanceDueDate: "2026-06-10",
      total: 342500,
      payments: [
        { date: "2026-04-15", amount: 150000, method: "Bank Transfer", stage: "Sales", collectedBy: "Aman Gupta", verification: "Verified", type: "ADVANCE", evidence: "rtgs-receipt.pdf" },
        { date: "2026-05-18", amount: 50000, method: "UPI", stage: "Pre-Ops", collectedBy: "Neha Verma", verification: "Recorded", type: "BALANCE", evidence: "upi-ref-9920.jpg" }
      ]
    },
    {
      id: "bk-104", code: "OBT-24120",
      client: { title: "Ms.", name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 90048 33219" },
      destination: "Switzerland", country: "Switzerland", duration: "7N/8D",
      bookingDate: "2026-05-02", travelDate: "2026-07-05", balanceDueDate: "2026-05-25",
      total: 680000,
      payments: []
    },
    {
      id: "bk-105", code: "OBT-24109",
      client: { title: "Mr.", name: "Arjun Mehta", email: "arjun.mehta@example.com", phone: "+91 98765 21004" },
      destination: "Dubai", country: "UAE", duration: "3N/4D",
      bookingDate: "2026-05-01", travelDate: "2026-06-19", balanceDueDate: "2026-06-15",
      total: 124000,
      payments: [
        { date: "2026-05-05", amount: 40000, method: "UPI", stage: "Sales", collectedBy: "Divya Rao", verification: "Verified", type: "ADVANCE", evidence: "upi-ref-7731.jpg" }
      ]
    },
    {
      id: "bk-106", code: "OBT-24088",
      client: { title: "Mrs.", name: "Fatima Sheikh", email: "fatima.sheikh@example.com", phone: "+91 99876 50032" },
      destination: "Kerala", country: "India", duration: "4N/5D",
      bookingDate: "2026-02-24", travelDate: "2026-03-20", balanceDueDate: "2026-03-12",
      total: 88500,
      payments: [
        { date: "2026-02-28", amount: 88500, method: "Bank Transfer", stage: "Sales", collectedBy: "Aman Gupta", verification: "Verified", type: "FULL", evidence: "neft-advice.pdf" }
      ]
    },
    {
      id: "bk-107", code: "OBT-24061",
      client: { title: "Mr.", name: "Vikram Reddy", email: "vikram.reddy@example.com", phone: "+91 90030 91187" },
      destination: "Thailand", country: "Thailand", duration: "5N/6D",
      bookingDate: "2026-05-06", travelDate: "2026-06-28", balanceDueDate: "2026-06-20",
      total: 215000,
      payments: [
        { date: "2026-05-12", amount: 75000, method: "Cash", stage: "Sales", collectedBy: "Divya Rao", verification: "Verified", type: "ADVANCE", evidence: "cash-voucher-204.jpg" },
        { date: "2026-05-26", amount: 40000, method: "UPI", stage: "Pre-Ops", collectedBy: "Neha Verma", verification: "Recorded", type: "BALANCE", evidence: "upi-ref-1042.jpg" }
      ]
    },
    {
      id: "bk-108", code: "OBT-24044",
      client: { title: "Ms.", name: "Sneha Patel", email: "sneha.patel@example.com", phone: "+91 98191 22008" },
      destination: "Singapore", country: "Singapore", duration: "4N/5D",
      bookingDate: "2026-05-15", travelDate: "2026-07-02", balanceDueDate: "2026-06-08",
      total: 156000,
      payments: []
    },
    {
      id: "bk-109", code: "OBT-24017",
      client: { title: "Mr.", name: "Karan Malhotra", email: "karan.malhotra@example.com", phone: "+91 99100 47781" },
      destination: "Andaman", country: "India", duration: "4N/5D",
      bookingDate: "2026-03-19", travelDate: "2026-05-04", balanceDueDate: "2026-04-22",
      total: 112500,
      payments: [
        { date: "2026-03-24", amount: 50000, method: "Bank Transfer", stage: "Sales", collectedBy: "Aman Gupta", verification: "Verified", type: "ADVANCE", evidence: "neft-advice.pdf" },
        { date: "2026-04-30", amount: 62500, method: "Bank Transfer", stage: "Post-Ops", collectedBy: "Rohit Sinha", verification: "Verified", type: "BALANCE", evidence: "neft-advice-2.pdf" }
      ]
    },
    {
      id: "bk-110", code: "OBT-23998",
      client: { title: "Mrs.", name: "Lakshmi Nair", email: "lakshmi.nair@example.com", phone: "+91 90087 65510" },
      destination: "Vietnam", country: "Vietnam", duration: "6N/7D",
      bookingDate: "2026-04-20", travelDate: "2026-06-09", balanceDueDate: "2026-05-22",
      total: 268000,
      payments: [
        { date: "2026-04-30", amount: 100000, method: "Bank Transfer", stage: "Sales", collectedBy: "Divya Rao", verification: "Verified", type: "ADVANCE", evidence: "neft-advice.pdf" }
      ]
    }
  ];

  /* ---------- Derivation ---------- */
  function statusOf(total, collected) {
    if (collected <= 0) return "UNPAID";
    if (collected >= total) return "PAID";
    return "PARTIAL";
  }

  // SLA badge: returns {text, tone} or null when fully paid
  function slaOf(b, balance) {
    if (balance <= 0) return null;
    var due = parse(b.balanceDueDate);
    var diff = daysBetween(TODAY, due); // >0 = future
    if (diff < 0) return { text: "Overdue by " + Math.abs(diff) + "d", tone: "red", overdue: true };
    if (diff === 0) return { text: "Due today", tone: "amber" };
    if (diff === 1) return { text: "Due by Day 1", tone: "amber" };
    if (diff <= 7) return { text: "Due in " + diff + "d", tone: "amber" };
    return { text: "Due " + fmtDateShort(b.balanceDueDate), tone: "neutral" };
  }

  function derive(b) {
    var collected = (b.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    var balance = b.total - collected;
    var percent = b.total > 0 ? Math.min(100, Math.round((collected / b.total) * 100)) : 0;
    var status = statusOf(b.total, collected);
    // latest collection stage (by date)
    var latest = null;
    (b.payments || []).forEach(function (p) {
      if (!latest || parse(p.date) >= parse(latest.date)) latest = p;
    });
    return Object.assign({}, b, {
      collected: collected,
      balance: balance,
      percent: percent,
      status: status,
      latestStage: latest ? latest.stage : null,
      latestPayment: latest,
      sla: slaOf(b, balance)
    });
  }

  function deriveAll(bookings) { return bookings.map(derive); }

  // portfolio totals for the dashboard
  function totals(derived) {
    var t = { value: 0, collected: 0, balance: 0, paid: 0, partial: 0, unpaid: 0 };
    derived.forEach(function (b) {
      t.value += b.total; t.collected += b.collected; t.balance += b.balance;
      if (b.status === "PAID") t.paid++;
      else if (b.status === "PARTIAL") t.partial++;
      else t.unpaid++;
    });
    return t;
  }

  /* ---------- Invoices: one per payment EVENT ---------- */
  // INV-024187-001  ->  INV-{6-digit booking number}-{seq within booking}
  function invNumber(code, seq) {
    var digits = (code.match(/\d+/) || ["0"])[0];
    while (digits.length < 6) digits = "0" + digits;
    var s = String(seq);
    while (s.length < 3) s = "0" + s;
    return "INV-" + digits + "-" + s;
  }

  function buildInvoices(bookings) {
    var rows = [];
    bookings.forEach(function (b) {
      var d = derive(b);
      (b.payments || []).forEach(function (p, i) {
        rows.push({
          invId: invNumber(b.code, i + 1),
          bookingId: b.id,
          code: b.code,
          client: b.client,
          destination: b.destination,
          country: b.country,
          duration: b.duration,
          travelDate: b.travelDate,
          packageTotal: b.total,
          collectedToDate: d.collected, // collected across whole booking (context)
          date: p.date,
          type: p.type,
          method: p.method,
          stage: p.stage,
          collectedBy: p.collectedBy,
          verification: p.verification,
          amount: p.amount,
          evidence: p.evidence
        });
      });
    });
    rows.sort(function (a, b) { return parse(b.date) - parse(a.date); });
    return rows;
  }

  /* ---------- Current user ---------- */
  var USER = { name: "Rahul Khanna", first: "Rahul", role: "Administrator", initials: "RK", email: "rahul.khanna@outboundtravelers.com" };

  /* ---------- Expose ---------- */
  window.OBT = {
    fmtINR: fmtINR, grp: grp, fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    TODAY: TODAY, BOOKINGS: BOOKINGS, USER: USER,
    derive: derive, deriveAll: deriveAll, totals: totals,
    buildInvoices: buildInvoices, invNumber: invNumber
  };
})();
