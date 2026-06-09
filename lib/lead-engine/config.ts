// Lead Engine — config + IST time-window helpers.
// All timestamps are stored UTC; operating-mode logic runs in IST (UTC+5:30, no DST).

import { queryRows } from "@/lib/db"

export const IST_OFFSET_MIN = 330 // +5:30

export type LeadConfig = {
  WORK_START: string; WORK_END: string; ASSIGN_CUTOFF: string
  MORNING_BATCH_SIZE: number; MORNING_DEADLINE: string
  LIVE_WIP: number
  SLA_HOT: number; SLA_WARM: number; SLA_COLD: number
  MAX_MISSES: number; PRESALES_CAP: number
  HOT_THRESHOLD: number; HOT_ALERT_MIN: number
  MAX_FUP_ATTEMPTS: number; BOOMERANG_DAYS: number
  HOARD_STOP: number; HOARD_RESUME: number
  MORNING_ALLOC: "auto" | "constrained"
  MORNING_DEADLINE_TYPE: "clock" | "duration"
  RR_POINTER: number
  // Module N — Pending Quotes SLA
  QUOTE_SLA: number; QUOTE_REMINDER_INTERVAL: number; QUOTE_MANAGER_PREALERT: number
  QUOTE_HARD_LIMIT: number; QUOTE_OFFLINE_GRACE: number; QUOTE_TRANSFER_CAP: number
  // Booking Date Not Confirmed (safe build)
  LOCK_NUDGE_INTERVAL_H: number; LOCK_NUDGE_MAX: number; PREOPS_MIN_DAYS: number
}

const DEFAULTS: LeadConfig = {
  WORK_START: "09:00", WORK_END: "18:00", ASSIGN_CUTOFF: "17:30",
  MORNING_BATCH_SIZE: 3, MORNING_DEADLINE: "11:00",
  LIVE_WIP: 2, SLA_HOT: 5, SLA_WARM: 15, SLA_COLD: 30,
  MAX_MISSES: 3, PRESALES_CAP: 10,
  HOT_THRESHOLD: 80, HOT_ALERT_MIN: 5,
  MAX_FUP_ATTEMPTS: 6, BOOMERANG_DAYS: 30,
  HOARD_STOP: 100, HOARD_RESUME: 80,
  MORNING_ALLOC: "auto", MORNING_DEADLINE_TYPE: "clock", RR_POINTER: 0,
  QUOTE_SLA: 30, QUOTE_REMINDER_INTERVAL: 5, QUOTE_MANAGER_PREALERT: 60,
  QUOTE_HARD_LIMIT: 120, QUOTE_OFFLINE_GRACE: 5, QUOTE_TRANSFER_CAP: 1,
  LOCK_NUDGE_INTERVAL_H: 24, LOCK_NUDGE_MAX: 5, PREOPS_MIN_DAYS: 7,
}

const NUMERIC_KEYS = new Set([
  "MORNING_BATCH_SIZE", "LIVE_WIP", "SLA_HOT", "SLA_WARM", "SLA_COLD", "MAX_MISSES",
  "PRESALES_CAP", "HOT_THRESHOLD", "HOT_ALERT_MIN", "MAX_FUP_ATTEMPTS", "BOOMERANG_DAYS",
  "HOARD_STOP", "HOARD_RESUME", "RR_POINTER",
  "QUOTE_SLA", "QUOTE_REMINDER_INTERVAL", "QUOTE_MANAGER_PREALERT", "QUOTE_HARD_LIMIT",
  "QUOTE_OFFLINE_GRACE", "QUOTE_TRANSFER_CAP",
  "LOCK_NUDGE_INTERVAL_H", "LOCK_NUDGE_MAX", "PREOPS_MIN_DAYS",
])

export async function loadConfig(db: D1Database): Promise<LeadConfig> {
  const rows = await queryRows<{ key: string; value: string }>(db, "SELECT key, value FROM lead_config")
  const cfg: any = { ...DEFAULTS }
  for (const r of rows) {
    cfg[r.key] = NUMERIC_KEYS.has(r.key) ? Number(r.value) : r.value
  }
  return cfg as LeadConfig
}

// ─── IST time helpers ───────────────────────────────────────────

/** {hour, minute, dow(0=Sun), minutesOfDay, dateKey 'YYYY-MM-DD'} in IST for a given UTC date. */
export function istParts(d = new Date()) {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  const hour = ist.getUTCHours()
  const minute = ist.getUTCMinutes()
  return {
    hour, minute, dow: ist.getUTCDay(),
    minutesOfDay: hour * 60 + minute,
    dateKey: ist.toISOString().slice(0, 10),
  }
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + (m || 0)
}

/** Working day = not Sunday (holidays from HRMS added later). */
export function isWorkingDay(d = new Date()): boolean {
  return istParts(d).dow !== 0
}

/** 'live' (09:00–17:30 on a working day) or 'offhours'. */
export function operatingMode(cfg: LeadConfig, d = new Date()): "live" | "offhours" {
  if (!isWorkingDay(d)) return "offhours"
  const mins = istParts(d).minutesOfDay
  return mins >= hhmmToMinutes(cfg.WORK_START) && mins < hhmmToMinutes(cfg.ASSIGN_CUTOFF)
    ? "live" : "offhours"
}

export function slaMinutesFor(cfg: LeadConfig, temperature: string): number {
  return temperature === "hot" ? cfg.SLA_HOT : temperature === "warm" ? cfg.SLA_WARM : cfg.SLA_COLD
}

export function addMinutesISO(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

/**
 * Working minutes between two instants (Module N). Counts only time inside the
 * [WORK_START, WORK_END] window on working days (Sun off; holidays added later),
 * so off-hours/weekends contribute 0 — this is the quote-SLA working-hours pause
 * (FR-QUOTE-7). Computed on the IST timeline.
 */
export function workingMinutesBetween(cfg: LeadConfig, startISO: string, endISO = new Date().toISOString()): number {
  const MIN = 60_000, DAY = 86_400_000
  const istStart = new Date(startISO).getTime() + IST_OFFSET_MIN * MIN
  const istEnd = new Date(endISO).getTime() + IST_OFFSET_MIN * MIN
  if (istEnd <= istStart) return 0
  const wStart = hhmmToMinutes(cfg.WORK_START), wEnd = hhmmToMinutes(cfg.WORK_END)
  let total = 0
  let dayBase = Math.floor(istStart / DAY) * DAY
  let guard = 0
  for (; dayBase < istEnd && guard < 800; dayBase += DAY, guard++) {
    const dayIndex = Math.floor(dayBase / DAY)
    if ((dayIndex + 4) % 7 === 0) continue // Sunday
    const lo = Math.max(dayBase + wStart * MIN, istStart)
    const hi = Math.min(dayBase + wEnd * MIN, istEnd)
    if (hi > lo) total += (hi - lo) / MIN
  }
  return total
}

export async function setConfig(db: D1Database, key: string, value: string) {
  const { execute } = await import("@/lib/db")
  await execute(db,
    "INSERT INTO lead_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
    [key, value])
}
