# PRD — Lead Assignment, Reassignment & Follow-up Engine
### Outbound One CRM (Travel) — integrated into TMS Salesperson "Today's Work"

| | |
|---|---|
| **Product** | Outbound One CRM — Lead Engine module |
| **Version** | 1.0 |
| **Date** | 3 June 2026 |
| **Status** | Ready for implementation |
| **Timezone** | All times are **IST (Asia/Kolkata)** unless stated |
| **Currency** | INR (₹) |
| **Integration target** | TMS salesperson page → a **"Today's Work"** workspace |

> Full PRD text is the source of truth. This file is committed so the build can
> reference every FR-* requirement and AC-* acceptance scenario directly.
> Key integration note: this engine is surfaced to **sales agents** inside a
> **"Today's Work"** view on the TMS `/sales` area. Working hours, cutoff, and the
> holiday calendar are sourced from **HRMS** (the unified `hrms-db`); follow-up
> templates from **TMS WhatsApp SOPs**; payment reminders tie into **TMS Finance**.

## Summary of the engine
- **Capture (24/7):** every inbound lead is captured, scored (Hot/Warm/Cold), auto-replied, deduped.
- **Time windows:** live assignment 09:00–17:30; after 17:30 + off-hours → pool. Sourced from HRMS.
- **Overnight pool:** durable, oldest-first; presales drain oldest-first, sales backfill newest-first.
- **Morning batch (login-gated):** on login an agent pulls 3 leads; due by 11:00; untouched → escalate; no login = no leads (stay pooled).
- **Live assignment:** round-robin to online + under-WIP agents; first-touch SLA (Hot 5 / Warm 15 / Cold 30 min, per-assignment clock); touched = sticky; untouched reassigns SP1→SP2→SP3; 3 misses → escalate.
- **Touch:** call/WhatsApp/email/note/followup/stage-change count; viewing does not.
- **Scoring:** rule-based points → temperature; Hot ≥80 → senior + 5-min manager alert.
- **Presales:** sweep pool oldest-first, cap 10, qualify → hand to sales.
- **Follow-up engine:** cadence by temperature, channel rotation (WA→call→email), auto-tasks+templates, reply resets+advances, max attempts → Boomerang (not Lost).
- **Escalation:** bounce cap / morning deadline / hot timeout → manager queue.
- **Anti-hoarding:** stop new assignments >100 active, resume <80.
- **Dashboards:** agent (Today's Work), leaderboard (Evening-Leads highlight), manager (escalations/pool/SLA).

## Config defaults
WORK_START/END 09:00/18:00 · ASSIGN_CUTOFF 17:30 · MORNING_BATCH_SIZE 3 · MORNING_DEADLINE 11:00 ·
LIVE_WIP 2 · SLA_HOT/WARM/COLD 5/15/30 min · MAX_MISSES 3 · PRESALES_CAP 10 · HOT_THRESHOLD 80 ·
HOT_ALERT_MIN 5 · MAX_FUP_ATTEMPTS 6 · BOOMERANG_DAYS 30 · HOARD_STOP/RESUME 100/80.

## Data model (new tables in outbound-tms)
`leads`, `lead_assignments`, `touch_events`, `followup_tasks`, `escalations`, `lead_pool` (derived), `shift_config` (synced from HRMS).
(See full field specs in the canonical PRD §8.)

## Acceptance scenarios (write as tests first)
- **AC-1** Overnight pooling + auto-reply (no assignment, no SLA at 21:00).
- **AC-2** Morning login gate + 11:00 deadline + escalation (A@09:00, B@09:35 get 3 each; C never logs in → none, no escalation).
- **AC-3** Live round-robin + first-touch SLA + ladder (touched=sticky; untouched → SP2 → SP3 → escalate after 3).
- **AC-4** Backfill newest-first (sales) vs presales oldest-first.
- **AC-5** Follow-up cadence + reply reset + Boomerang.
- **AC-6** Anti-hoarding (stop >100, resume <80).

## Open decisions (confirm before coding)
- **D1** Morning allocation: auto-pull 3 vs constrained-choice window (show ~5–6, pick 2–3).
- **D2** Cutoff 17:30 (confirm vs HRMS shift).
- **D3** Morning deadline: fixed clock (11:00 for all) vs fixed duration (e.g. 2h from login).
- **D4** Presales→sales handoff target: live round-robin vs chosen/senior agent.
- **D5** Batch & WIP sizes (3 / 2).
- **D6** Real headcount (sales/presales now vs target) → pool drains in a morning or over days.
- **D7** Weighted scoring deferred to Phase 3 (confirm).

## Phasing
- **Phase 1 (MVP):** capture + auto first-touch, time windows from HRMS, pool, login-gated morning batch + 11:00 deadline + escalation, live round-robin + SLA + reassignment ladder + bounce-cap escalation, touch, basic dashboards, presence, anti-hoarding. Assignment = least-loaded + online + round-robin (no weighted score).
- **Phase 2:** follow-up engine, presales sweep + handoff, rule-based scoring + hot fast-track, leaderboard Evening-Leads.
- **Phase 3:** weighted allocation, language/destination matching, full analytics.

*(Canonical full PRD provided by product owner on 3 June 2026; this is the committed working copy. Expand any section from the original as needed during implementation.)*
