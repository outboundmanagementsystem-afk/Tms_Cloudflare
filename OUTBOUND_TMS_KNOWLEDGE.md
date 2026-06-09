# Outbound Travelers TMS — Project Knowledge Base

> **Purpose of this file.** A single, self-contained brief of the system and everything built/decided in the session of **29–30 May 2026**. Hand this to Claude Code (or any dev) as context to brainstorm, extend, or review. It is descriptive (what exists + why) — not a tutorial. Pair it with the codebase.

---

## 1. What the product is

**Outbound Travelers TMS** is an internal travel/tour management system for an Indian outbound travel agency. It runs the full lifecycle of a trip:

```
Sales (quote/itinerary) → Confirm → Handover → Pre-Ops (vouchers, DMC, checklists)
   → Post-Ops (on-tour monitoring, balance collection) → Completed
Finance runs alongside (payments, invoices, the finance register).
```

It is **role-based**: every staff member sees only their lane.

---

## 2. Tech stack & environment

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack), **React 19**, TypeScript |
| Styling | **Tailwind CSS v4** (Lightning CSS, supports native nesting) + heavy inline styles + shadcn/ui components |
| Data | **Firebase Firestore** (client SDK only — no Admin SDK / service account in repo) |
| Auth | Firebase Auth (Google sign-in); profiles in Firestore `users` collection |
| AI | **Google Gemini** via REST (`gemini-2.5-flash`); key in `GEMINI_API_KEY` env (server-only) |
| File storage | Cloudflare R2 worker (`outbound-storage.outboundmanagementsystem.workers.dev`) for payment screenshots |
| Deploy | Cloudflare Workers via `@opennextjs/cloudflare` (wrangler) |
| Repo | `github.com/outboundmanagementsystem-afk/Outbound_management.git`; local at `Downloads/outboundtms` |

**Build notes:** `next.config.mjs` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` (Next 16 warns the `eslint` key is deprecated — harmless). `tsconfig` path alias `@/* → ./*`. Dev server: `npm run dev` (runs on :3000, hot-reloads). Production check: `npm run build`.

**Important architectural fact:** Firestore security rules are **permissive** — any signed-in role can read all `itineraries` (the existing universal search already loads them all client-side). So **role separation is enforced in the client/app layer, not hard DB rules.** For true isolation later, tighten `firestore.rules` + move reads behind the Firebase Admin SDK.

---

## 3. Roles & the data model

### Roles (`lib/auth-context.tsx`, `lib/role-utils.ts`)
`admin`, `owner` (→ `/admin`), `sales_lead`, `sales` (→ `/sales`), `pre_ops_lead`, `pre_ops` / legacy `ops_lead`,`ops` (→ `/ops`), `post_ops_lead`, `post_ops` (→ `/post-ops`), `finance_lead`, `finance` (→ `/finance`). `owner` is treated as `admin`.

**Ownership/linking fields:**
- `itinerary.createdBy` = the sales rep's uid; `itinerary.salesName` = their name.
- `user.leadId` = the uid of that user's team lead (defines "my team").
- `itinerary.assignedPreOpsId` / `assignedOps` = the Pre-Ops person handling it.
- Post-ops has **no per-person assignment** — the whole post-ops team shares post-ops/completed bookings.

### Firestore collections
- **`users`** — `{uid, name, email, role, employeeCode, department, leadId, phone, createdAt}` (NO photo field today).
- **`destinations`** + subcollections `hotels, attractions, activities, transfers, vehicleRules, dayPlans` — the pricing master.
- **`packages`** (ready-made templates) + subs `days, hotels, flights, transfers, pricing, activities`.
- **`itineraries`** — the core booking. Key fields: `createdBy, salesName, customerName, customerPhone, customerEmail, quoteId, destination, status, plans[] (each {planId,name,totalPrice}), selectedPlanId, margin, amountPaid, startDate, endDate, nights, days, assignedPreOpsId/Name, postOpStage, createdAt, updatedAt`. Subs: `days, hotels, flights, transfers, pricing, activities, payments, sopChecklist, postOpsChecklist, salesChecklist, postOps/data`.
- **`customers`** — `{name, phone, email, createdBy, createdByName}`.
- **`drafts`** — per-user `{userId}`.
- **`sops`** — `{title, department, items[], stage, whatsappTemplate}`.
- **`settings`**.

### Money fundamentals (`lib/aura/money.ts`)
- **Sell price (booking value)** = `plans.find(planId===selectedPlanId)?.totalPrice ?? plans[0]?.totalPrice ?? totalPrice ?? sellPrice`.
- **Margin %** = `itinerary.margin` (default 15).
- **Revenue/profit (legacy)** = `sell × margin/(100+margin)`. *(Note: the Finance Register uses a different, more explicit revenue model — see §6.)*
- **Status:** PAID if `amountPaid ≥ total`, PARTIAL if `0 < amountPaid < total`, UNPAID if `0`.

**Itinerary statuses:** `draft, sent, confirmed, handover, pre-ops, post-ops, completed`.

---

## 4. Feature built #1 — Aura AI (role-scoped assistant, 4 modes)

A floating ✨ widget (in `DashboardLayout`, every dashboard) **and** a dedicated page at `/assistant` (sidebar "Aura AI"). Built from 4 spec docs in the repo root (`Aura_AI_Build_Spec.pdf`, `aura-compare-quote-BUILD.md`, `aura-itinerary-draft-BUILD.md`, `aura-language-layer-BUILD.md`). The specs assumed a self-hosted model + pgvector; **adapted to Gemini + Firestore.**

**Core security principle:** the role-scoped knowledge context is built **on the authenticated client** (`lib/ai-context.ts`) and only that already-filtered slice is sent to the server route — so the model never receives out-of-scope data. The Gemini key stays server-side.

### The 4 modes (one route: `app/api/chat/route.ts`, branch on `mode`)
1. **Ask / Guidance** — SOP-grounded Q&A. Cites the SOP by title; fixed refusal line *"That's not covered in our SOP — please check with your team lead."*; role-boundary redirects (Spec §7); injects **code-computed booking sanity flags** (`lib/aura/sanity.ts`): advance % vs 30% rule, the known Final-Payment-Date bug (= arrival), ₹NaN DMC parse bug, stuck bookings, balance SLA. **Finance figures (margin/revenue/payments) = admin/owner ONLY** (stripped from every other role's context).
2. **Draft** — generate N tentative itineraries grounded ONLY in real inventory (`buildInventoryContext`); no firm prices, Day 1/2/3 (no calendar dates), `tentative:true`, no promises. JSON output.
3. **Compare** — paste a competitor quote → honest apple-to-apple comparison + USP talking points each tied to a differentiator id (`lib/aura/differentiators.ts`). JSON output.
4. **Compose** — client-facing message in the matched register (auto/English/**Tanglish**/Tamil), with a **hard numbers-intact guardrail** (`lib/aura/style-anchors.ts` `findMissingSacredTokens` — ₹ amounts, dates, codes must survive verbatim).

### Role data scopes (in Ask mode)
admin/owner = everything incl. finance; sales_lead = own + team (`leadId`); sales = own (`createdBy`); pre_ops_lead = team's assigned + handover/pre-ops; pre_ops = own assigned; post_ops(_lead) = all post-ops/completed; finance role = operational view, **finance figures blocked** (admin-only by explicit decision).

**Files:** `lib/ai-context.ts`, `lib/aura/{money,sanity,differentiators,style-anchors}.ts`, `app/api/chat/route.ts`, `components/ai-assistant.tsx`, `app/assistant/{layout,page}.tsx`.

**To customize before relying on it:** edit `lib/aura/differentiators.ts` (real, honest USPs) and `lib/aura/style-anchors.ts` (20–40 real Tanglish messages).

---

## 5. Feature built #2 — Finance module redesign

A polished reference design (provided as `finance/` folder: jsx + `styles.css` + `_shots/*.png`) was ported into the live finance pages, wired to real Firestore.

- **Design system:** `app/finance/finance-theme.css` — the entire theme is **scoped under `.fin-scope`** (and `.fin-drawer-root` for the fixed drawer) because the reference's `:root` vars (e.g. `--primary:#0F8A5F`) would clash with the app's global shadcn `--primary`. Loads **Hanken Grotesk**. The dark sidebar/topbar come from the shared `DashboardLayout` (already matched the reference).
- **Pages rebuilt:** `app/finance/page.tsx` (dashboard: 6 KPI cards + "Requires Payment Collection" list with SLA badges), `app/finance/payments/page.tsx` (filter chips, table w/ progress bars, **slide-over payment drawer** + Record Payment form), `app/finance/invoices/page.tsx` (table + printable invoice sheet).
- **Data layer:** `lib/finance/derive.ts` — maps itineraries+payments to a "derived booking" (status, SLA from `balanceDueDate = finalPaymentDate || arrival−7`, invoices = one row per payment event), `fmtINR/fmtDate`, method/type label↔value mappers.
- **UI components:** `components/finance/ui.tsx` (MetricCard, Progress, StatusPill, StageBadge, TypePill, SLABadge, MethodLabel, etc.), `components/finance/payment-drawer.tsx`.
- **Extended `lib/firestore.ts` `addPayment`** to persist `stage` (Sales/Pre-Ops/Post-Ops) + `verification` (Verified/Recorded).

---

## 6. Feature built #3 — Finance Register (replaces the Excel sheet)  ⭐ the big one

Finance was running everything in a Google Sheet ("Sales - FY 2026-27") with 32 columns, full of `#DIV/0!`, hundreds of empty rows, manual dropdowns, and fragile formulas. We replaced it with a live page at **`/finance/register`** (sidebar "Finance Register"). There's also a standalone visual mockup: **`finance-register-mockup.html`** (open in a browser).

### The 32 columns and where each comes from
- **AUTO from the TMS booking (read-only):** Status, Entry Date (`createdAt`), Team Lead (rep's `leadId`→name), Rep (`salesName`/`createdBy`), Customer, Mobile, No. of Members, Travel Month, Check-in (`startDate`), Check-out (`endDate`), Destination, Package (selected plan name), **Total Cost Inc GST** (sell price), **Amount Received** (`amountPaid`).
- **AUTO-DERIVED (computed live):** Sl No, Month, **Total Cost** = IncGST ÷ 1.05, **GST @5%** = IncGST − TotalCost, **Adv %** = Received ÷ IncGST, **Balance** = IncGST − Received, **Agent Fees** = AgentFeesWithGST ÷ 1.05, **Balance 2** = AgentFeesWithGST − AmountPaid, **Revenue**, **Revenue %**.
- **MANUAL (finance fills — persisted as `fin*` fields on the itinerary doc):** Type (Domestic/International), GST Inv No, City, Agent Fees with GST, Amount Paid (to agent), TCS, DMC, Remarks 1, Remarks 2.

### ⚠ Calculation rules (CONFIRMED with the user)
- **GST = 5%, inclusive.** Total Cost (excl GST) = `IncGST / 1.05`; GST@5% = `IncGST − TotalCost`.
- **TCS = 2%** (changed from 5%). Auto-computed for **International** bookings on the GST-exclusive cost (`round(totalCost × 0.02)`); 0 for Domestic; editable override via `finTcs`.
- **Revenue (absolute)** = `TotalCost(excl GST) − DMC − AgentFees(excl GST)`.
- **Revenue %** = `Revenue ÷ (TotalCost − TCS)` — i.e. the base **excludes both GST and TCS**. Used as the margin everywhere in analytics too.
- **TCS is a pass-through liability**, not income (shown separately in P&L, never added to revenue).

### Persistence model (key decision)
The 9 manual fields are stored as top-level `fin*` fields **on the itinerary document** (`finType, finGstInvNo, finCity, finAgentGst, finAgentPaid, finTcs, finDmc, finR1, finR2`) via the existing `updateItinerary`. → **one `getItineraries()` fetch, no N+1 reads**, and finance/admin can write per the existing rules.

### Three tabs (`components/finance/register-view.tsx`)
1. **Register** — the full grid. AUTO cells plain, DERIVED cells green-tinted, MANUAL cells amber and **editable inline directly in the table** (Type select; text inputs for invoice/city/remarks; number inputs for agent fees/amount paid/TCS/DMC). Inline edit: `onChange` updates local state (live recompute of derived cells + totals footer), `onBlur` persists to Firestore. A **focused entry drawer** also exists (click a customer) for guided entry with a live calc panel. Filters: status chips, month, rep, search. Totals footer. CSV export.
2. **Reports** — group by **Monthly / Weekly / Daily / Rep (person-wise) / Team Lead / Destination / Status / Type**; KPI cards + totals table + CSV export per report.
3. **P&L & Analytics** — see below.

### Analytics tab (what it shows — "all the analysis the data can give")
- **8 KPIs:** Net Revenue (+ % net margin), Total Sales (Inc GST), Total Collected, Outstanding, GST Payable @5%, TCS Collected @2%, DMC/Supplier Cost, Avg Booking Value.
- **Profit & Loss statement:** Gross Sales → less GST → Net Sales → less DMC → Gross Profit → less Agent Fees → **Net Revenue**, each with % of net sales; TCS noted as a liability.
- **Revenue Trend & Forecast:** 12-month bar chart (metric switch: Revenue/Sales/Collected/Bookings) with a **dashed forecast bar for next month** (least-squares trend). Forecast cards: next-month, next-quarter, avg growth %/month.
- **Period comparisons:** **This month vs last month** and **last 6 months vs prior 6 months** (Revenue, Sales, Collected, Bookings — each with ▲/▼ % change).
- **Breakdowns:** profit-by-destination (with margin %), revenue-by-type donut (Domestic vs International), top reps by revenue, **receivables aging** (Overdue / Due ≤7d / Upcoming), **cash & liabilities** (collected, outstanding, DMC committed, GST payable, TCS payable, agent payouts pending).

**Math lives in `lib/finance/register.ts`** (`buildRows`, `monthlySeries`, `trailingMonths`, `totals`, `lsq` forecast, `groupBy`, `aging`). Charts are inline SVG strings rendered via `dangerouslySetInnerHTML`.

**Mockup extras (not yet in the live page):** the HTML mockup also has an "+ Add Booking" picker (pull a confirmed TMS booking into the register) and a **"Rollout Plan" tab** describing the 3 implementation phases (see §8).

---

## 7. Feature built #4 — Sales Leaderboard (gamified)

Live at **`/leaderboard`** (sidebar "Leaderboard" 🏆 for admin/owner + sales/sales_lead). Component: `components/leaderboard.tsx`.

- **Score = (deals closed × 10) + (itineraries created × 3).** Closed = itinerary status ∈ {confirmed, handover, pre-ops, post-ops, completed}; generated = non-draft itineraries `createdBy` the rep.
- **Podium** (matches the user's hand sketch): 2nd–1st–3rd, avatar sizes 104/132/88 px, pedestal heights, crown 👑 on #1, medals 🥇🥈🥉, gold/silver/bronze. Everyone below = ranked rows with progress bars.
- **Live movement indicators:** green **▲ up** / red **▼ down** / grey **–**, by comparing current rank to the previous rank stored in `localStorage["lb_prev_<period>"]`, updated each refresh. **Auto-refresh every 45s** + manual refresh + **Fullscreen** button (for an office TV).
- **Period tabs:** Today / This Week / This Month / All-time.
- **Photos:** uses `user.photoURL || user.photo` if present on the user doc; else a polished initials avatar. **User docs have no photo field yet** — to show real faces, add `photoURL` to user docs (and to `UserProfile` in `lib/auth-context.tsx`) + an upload UI on the Users admin screen.

---

## 8. The 3-phase rollout plan (from the mockup)

How the finance system can be adopted (each phase stands alone):
1. **Replace the spreadsheet** *(recommended start, zero risk)* — live Register, auto-fill, simple entry, no errors, search/filter, CSV export. ✅ **Built.**
2. **Reports & insights** — all groupings, P&L, forecast, comparisons, GST/TCS summaries, month-close. ✅ **Built.**
3. **Automation & control** *(future)* — auto-sync on booking/payment, overdue/payment alerts (via Aura), approval workflow + audit log, role locks (revenue/DMC admin-only), one-click export to Tally/Zoho Books.

---

## 9. Design system (the new UI standard)

The finance reference look is now the standard, encapsulated as the **`.fin-scope`** scoped theme (`app/finance/finance-theme.css`): emerald→forest palette (`--primary #0F8A5F`), Hanken Grotesk, cards/tables/pills/metric-cards/drawer/analytics-panels. The dark green sidebar/topbar already match (shared `DashboardLayout`). **Pending:** roll this look out module-by-module to Sales → Admin → Ops/Post-Ops (the user asked to "update the complete tool like this"; deferred to do finance first and verify).

---

## 10. File map (everything added/changed this session)

```
lib/
  ai-context.ts                    # Aura role-scoped context + inventory builder + role boundaries + sanity flags
  aura/money.ts                    # getSellPrice/getMargin/getRevenue/fmt
  aura/sanity.ts                   # computeBookingFlags (advance%, FPD bug, ₹NaN DMC, stuck, balance SLA)
  aura/differentiators.ts          # honest USPs for Compare mode  [EDIT with real USPs]
  aura/style-anchors.ts            # Tanglish anchors + findMissingSacredTokens  [EDIT with real msgs]
  finance/derive.ts                # finance dashboard/payments/invoices derivation
  finance/register.ts              # Register rows + analytics math (TCS 2%, Revenue %)
  firestore.ts                     # addPayment now persists stage + verification
app/
  api/chat/route.ts                # Aura — 4 modes (ask/draft/compare/compose), Gemini 2.5 Flash
  assistant/{layout,page}.tsx      # Aura full page
  finance/finance-theme.css        # .fin-scope design system + register/analytics CSS
  finance/page.tsx                 # redesigned dashboard
  finance/payments/page.tsx        # redesigned payments + drawer
  finance/invoices/page.tsx        # redesigned invoices + printable sheet
  finance/register/page.tsx        # NEW Finance Register page
  leaderboard/{layout,page}.tsx    # NEW Leaderboard
components/
  ai-assistant.tsx                 # Aura widget + full + 4-mode tabs
  finance/ui.tsx                   # finance shared components
  finance/payment-drawer.tsx       # payment drawer + record form
  finance/register-view.tsx        # Register + Reports + Analytics (3 tabs) + inline editing + entry drawer
  leaderboard.tsx                  # gamified podium leaderboard
  dashboard-layout.tsx             # added Aura widget + nav links (Aura AI, Finance Register, Leaderboard)
finance-register-mockup.html       # standalone visual mockup (Register + Reports + Analytics + Rollout)
.env.local                         # GEMINI_API_KEY (gitignored)
```

---

## 11. Verified / status

- All builds compile clean (`npm run build`). Routes confirmed 200 on dev: `/assistant`, `/api/chat`, `/finance`, `/finance/payments`, `/finance/invoices`, `/finance/register`, `/leaderboard`.
- Aura tested end-to-end against live Gemini (SOP citation, finance refusal, draft, compare, Tanglish compose + numbers guardrail).

---

## 12. Open questions / things to confirm against real data (brainstorm prompts)

1. **Members count** — Register reads `pax.adults + pax.children`; confirm the real field name on itineraries (could be `travellers`, `members`, etc.).
2. **Package name** — reads the selected plan's `name`; verify plans carry a name.
3. **Final Payment Date** — SLA uses `finalPaymentDate || arrival−7`. Is `arrival−7` the right rule? Is a final-payment date stored anywhere?
4. **Revenue formula** — confirm `Revenue = TotalCost − DMC − AgentFees` and `Revenue % = Revenue ÷ (TotalCost − TCS)` match finance's intent. Should operating expenses/salaries factor into a "net profit" line?
5. **TCS** — 2% flat for International on GST-exclusive cost. India's real TCS on overseas tour packages is 5% (20% above ₹7L) — confirm the agency genuinely uses a flat 2%, or implement the slab.
6. **Type (Domestic/Intl)** — inferred from a domestic-destinations list; should it be a stored field on the booking instead?
7. **Leaderboard scoring** — weights (closed×10 + generated×3). Should revenue or conversion-rate factor in? Should it include ops/other roles?
8. **Photos** — add `photoURL` to user docs + upload UI for real leaderboard faces?
9. **Hardening** — finance figures are app-layer-restricted only. Worth tightening `firestore.rules` + Admin SDK for true isolation (esp. before Phase 3 approvals/audit).
10. **Rollout** — apply the `.fin-scope` design system across Sales/Admin/Ops next?

---

## 13. How to run

```bash
npm install
# add GEMINI_API_KEY=... to .env.local
npm run dev            # http://localhost:3000
npm run build          # production compile check
```
Log in as admin or finance to see `/finance/register`; admin or sales to see `/leaderboard`; the ✨ Aura widget appears on every dashboard.

---

*Generated 30 May 2026 as a session handoff / brainstorming database.*
