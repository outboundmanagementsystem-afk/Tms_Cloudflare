# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Outbound Travelers TMS** — an internal, role-based travel/tour management system for an Indian outbound travel agency. It runs the full trip lifecycle:

```
Sales (quote/itinerary) → Confirm → Handover → Pre-Ops (vouchers, DMC, checklists)
   → Post-Ops (on-tour monitoring, balance collection) → Completed
Finance runs alongside (payments, invoices, the finance register).
```

Every staff member sees only their lane. `OUTBOUND_TMS_KNOWLEDGE.md` in the repo root is a detailed session handoff describing the Aura AI, Finance module, Finance Register, and Leaderboard features — read it for deep context on those.

## Commands

```bash
npm run dev        # Next dev server on http://localhost:3000 (Turbopack, hot reload)
npm run build      # Production compile check — the canonical "did I break it" gate
npm run lint       # next lint (note: lint is ignored during builds, see below)
npm run start      # serve a production build

# Cloudflare deploy path (OpenNext)
npm run pages:build   # @opennextjs/cloudflare build
npm run preview       # wrangler dev (local Worker preview)
npm run deploy        # wrangler deploy
```

There is **no test suite**. `test-db.js` / `test-storage.js` in the root are ad-hoc connectivity probes, not a test runner. "Verification" means `npm run build` compiles clean and routes return 200 in `npm run dev`.

Requires `GEMINI_API_KEY` in `.env.local` (server-only; for Aura AI). Copy `.env.example`.

## Critical conventions

- **Build ignores type & lint errors.** `next.config.mjs` sets `typescript.ignoreBuildErrors: true` and ESLint is ignored during builds. A green `npm run build` does **not** mean the code is type-correct — it means it bundled. Don't rely on the build to catch type mistakes.
- **Path alias:** `@/*` → repo root (e.g. `@/lib/firestore`, `@/components/ui/button`).
- **Firebase config is hardcoded** in `lib/firebase.ts` (client SDK, public-by-design web keys). There is **no Admin SDK / service account** anywhere — all data access is the client SDK.
- **Security is enforced in the app layer, not the database.** `firestore.rules` are deliberately permissive: `itineraries` are world-readable (`allow read: if true`) and updatable by any signed-in role. Role separation (who sees what) is done client-side in React. Treat any "this role can't see X" requirement as an app-layer concern unless you're explicitly hardening the rules.
- **Windows / PowerShell** is the dev environment. `powershell.bat` exists as a helper. Use PowerShell syntax for shell commands.
- **Codemod scripts litter the root** (`fix-*.js`, `inject-*.js`, `update-*.js`, `move_routes*.js`, etc.). These are one-off historical migration/patch scripts, not part of the app. Ignore them unless explicitly asked.

## Architecture

### Routing & role gating (App Router)
- `app/layout.tsx` wraps everything in `AuthProvider` (`lib/auth-context.tsx`) + `DialogProvider`.
- Each role has a top-level route group: `app/admin`, `app/sales`, `app/ops` (= Pre-Ops), `app/post-ops`, `app/finance`. Shared pages: `app/assistant` (Aura), `app/leaderboard`, plus public-ish render routes `app/itinerary/[id]`, `app/invoice/[id]`, `app/voucher/[id]`.
- **`lib/role-utils.ts` is the single source of truth** for role → dashboard mapping (`getRoleDashboard`) and access checks (`isRoleAllowed`, which auto-treats `owner` as `admin`). Used by auth-context, `components/protected-route.tsx`, login, and the dashboard layout.
- Pages are guarded by wrapping in `<ProtectedRoute allowedRoles={[...]}>`, which redirects to the user's own dashboard if the role isn't allowed.
- Roles: `admin`/`owner` → `/admin`, `sales`/`sales_lead` → `/sales`, `pre_ops`/`pre_ops_lead` (+ legacy `ops`/`ops_lead`) → `/ops`, `post_ops`/`post_ops_lead` → `/post-ops`, `finance`/`finance_lead` → `/finance`. `*_lead` roles add "my team" visibility via `user.leadId`.
- `components/dashboard-layout.tsx` is the shared shell (dark green sidebar/topbar, nav per role, the floating ✨ Aura widget).

### Data layer
- **`lib/firestore.ts` is the data-access API** — all reads/writes go through its exported functions (`getItineraries`, `createItinerary`, `updateItinerary`, `updateItineraryStatus`, `addPayment`, destination/package/user CRUD, plus generic subcollection helpers). Prefer extending these over calling the Firestore SDK directly from components.
- Core collection is **`itineraries`** (the booking). Key fields: `createdBy`/`salesName` (owning rep), `customerName/Phone/Email`, `plans[]` + `selectedPlanId`, `margin`, `amountPaid`, `startDate/endDate/nights`, `status`, `assignedPreOpsId`, `postOpStage`. Subcollections: `days, hotels, flights, transfers, pricing, activities, payments, sopChecklist`, etc. Finance "manual" data is stored as top-level `fin*` fields **on the itinerary doc** (not a separate collection) to avoid N+1 reads.
- Other collections: `users`, `destinations` (+ pricing master subcollections: `hotels, attractions, activities, transfers, vehicleRules, dayPlans`), `packages` (ready-made templates), `customers`, `drafts`, `sops`, `settings`.
- **Ownership/linking fields drive visibility:** `itinerary.createdBy` = sales rep uid; `user.leadId` = team-lead uid (defines "my team"); `itinerary.assignedPreOpsId` = Pre-Ops handler. Post-Ops has no per-person assignment (team-shared).
- **Itinerary status flow:** `draft → sent → confirmed → handover → pre-ops → post-ops → completed` (`ItineraryStatus` in `lib/firestore.ts`).

### Money model (`lib/aura/money.ts`, `lib/finance/`)
- **Sell price** = selected plan's `totalPrice` (falls back to `plans[0]`, then `totalPrice`/`sellPrice`).
- GST is **5% inclusive**: `TotalCost(excl) = IncGST / 1.05`, `GST = IncGST − TotalCost`.
- **TCS = 2%** for International bookings on the GST-exclusive cost; 0 Domestic; override via `finTcs`. (India's statutory rate differs — confirmed as a flat 2% with the user.)
- **Revenue (absolute)** = `TotalCost(excl GST) − DMC − AgentFees(excl GST)`; **Revenue %** = `Revenue ÷ (TotalCost − TCS)`. TCS is a pass-through liability, never counted as income.
- Finance Register math lives in `lib/finance/register.ts` (`buildRows`, `monthlySeries`, `totals`, `lsq` forecast, `groupBy`, `aging`); dashboard/payments/invoices derivation in `lib/finance/derive.ts`. **Finance figures (margin/revenue) are admin/owner-only** by explicit decision — they're stripped from other roles' Aura context.

### Aura AI assistant
- One server route, `app/api/chat/route.ts`, branches on `body.mode` into 4 modes: **ask** (SOP-grounded Q&A with booking sanity flags), **draft** (tentative itineraries from real inventory only), **compare** (vs a competitor quote), **compose** (client message in English/Tanglish/Tamil with a numbers-intact guardrail). Model: `gemini-2.5-flash` via REST.
- **Security principle:** the role-scoped knowledge slice is built on the authenticated **client** in `lib/ai-context.ts`; only that pre-filtered context is sent to the server, so the model never receives out-of-scope data. The Gemini key stays server-side.
- Supporting logic: `lib/aura/{sanity,differentiators,style-anchors}.ts`. UI: `components/ai-assistant.tsx`. **`differentiators.ts` and `style-anchors.ts` contain placeholder USPs/messages meant to be edited with real content before relying on those modes.**

### UI
- shadcn/ui components in `components/ui/` (Radix + `class-variance-authority` + `tailwind-merge` via `cn()` in `lib/utils.ts`). Tailwind CSS v4 (Lightning CSS).
- The **finance design system** is a scoped theme: `app/finance/finance-theme.css` is namespaced under `.fin-scope` (and `.fin-drawer-root`) so its emerald `--primary` doesn't clash with the global shadcn theme. This is the intended future look for the rest of the app.
- PDFs/images: `jspdf`, `html2pdf.js`, `html2canvas`, `html-to-image`; OCR via `tesseract.js`; flight parsing in `lib/flight-parser.ts`.

### File storage
Payment screenshots upload to a **Cloudflare R2 Worker** (`cloudflare-worker/`), not Firebase Storage.

## Deploy targets
Two paths coexist: standard Next (`build`/`start`) and Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler` (`open-next.config.ts`, `wrangler.jsonc`). Firebase Hosting config (`firebase.json`, `.firebaserc`) is also present.
