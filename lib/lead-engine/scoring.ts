// Lead Engine — rule-based scoring (PRD §FR-SCORE). No ML (NG1).

import type { LeadConfig } from "./config"

export interface ScoreInput {
  travelDate?: string | null   // ISO date
  international?: boolean
  budget?: number | null       // INR
  corporate?: boolean
  isRepeat?: boolean
  family?: boolean
  tripType?: string | null
}

export interface ScoreResult {
  score: number
  temperature: "hot" | "warm" | "cold"
  breakdown: Record<string, number>
}

// §FR-SCORE-1 weights (configurable later via lead_config; constants for Phase 1).
const W = {
  within7d: 30,
  international: 20,
  budgetOver1L: 20,
  corporate: 25,
  repeat: 15,
  family: 10,
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.ceil((d - Date.now()) / 86_400_000)
}

export function scoreLead(input: ScoreInput, cfg: LeadConfig): ScoreResult {
  const b: Record<string, number> = {}
  const days = daysUntil(input.travelDate)
  if (days !== null && days <= 7) b.within7d = W.within7d
  if (input.international) b.international = W.international
  if ((input.budget ?? 0) > 100_000) b.budgetOver1L = W.budgetOver1L
  if (input.corporate || input.tripType === "business") b.corporate = W.corporate
  if (input.isRepeat) b.repeat = W.repeat
  if (input.family || input.tripType === "family") b.family = W.family

  const score = Object.values(b).reduce((a, x) => a + x, 0)
  // §FR-SCORE-2 thresholds: Hot ≥80, Warm 40–79, Cold <40 (HOT_THRESHOLD configurable).
  const temperature = score >= cfg.HOT_THRESHOLD ? "hot" : score >= 40 ? "warm" : "cold"
  return { score, temperature, breakdown: b }
}
