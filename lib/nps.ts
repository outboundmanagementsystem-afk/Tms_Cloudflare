// Post-Trip NPS / feedback helpers.
//
// Feedback is stored as a `feedback` object on the itinerary doc (folded into `extra`),
// so no new collection is needed. A booking is eligible for feedback once its trip is
// completed; it must be captured within 7 days, otherwise it is "overdue".

export type NpsCategory = "promoter" | "passive" | "detractor"
export type FeedbackStatus = "completed" | "partial" | "pending"

export type Feedback = {
  npsScore?: number | null
  ratings?: { accommodation?: number; transport?: number; sightseeing?: number; support?: number }
  valueForMoney?: "excellent" | "fair" | "poor" | ""
  highlight?: string
  improvement?: string
  status?: FeedbackStatus
  completedAt?: string
  by?: string
}

export const FEEDBACK_SLA_DAYS = 7

export function npsCategory(score: number | null | undefined): NpsCategory | null {
  if (score === null || score === undefined || isNaN(Number(score))) return null
  const s = Number(score)
  if (s >= 9) return "promoter"
  if (s >= 7) return "passive"
  return "detractor"
}

/** Derive completeness of a feedback record. */
export function feedbackStatus(fb: Feedback | undefined | null): FeedbackStatus {
  if (!fb) return "pending"
  const r = fb.ratings || {}
  const hasScore = fb.npsScore !== null && fb.npsScore !== undefined && !isNaN(Number(fb.npsScore))
  const ratingsFilled = [r.accommodation, r.transport, r.sightseeing, r.support].every(v => Number(v) > 0)
  const hasValue = !!fb.valueForMoney
  if (hasScore && ratingsFilled && hasValue) return "completed"
  if (hasScore || r.accommodation || r.transport || r.sightseeing || r.support || hasValue || fb.highlight || fb.improvement) return "partial"
  return "pending"
}

/** A booking whose trip has finished (in Feedback & Closure / completed). */
export function isTripCompleted(itin: any): boolean {
  return itin?.status === "completed" || itin?.postOpsStatus === "feedback-closure" || itin?.postOpStage === "completed"
}

/** Date the trip was completed (best-effort): explicit stamp → end date. */
export function completionDate(itin: any): Date | null {
  const raw = itin?.postOpsStatusUpdatedAt || itin?.endDate
  if (!raw) return null
  const d = new Date(String(raw).split("T")[0] + "T00:00:00")
  return isNaN(d.getTime()) ? null : d
}

/** Whole days since the trip completed (null if unknown / not completed). */
export function daysSinceCompletion(itin: any): number | null {
  const d = completionDate(itin)
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

/** Feedback is overdue: trip completed, >7 days elapsed, feedback not completed. */
export function isFeedbackOverdue(itin: any): boolean {
  if (!isTripCompleted(itin)) return false
  if (feedbackStatus(itin?.feedback) === "completed") return false
  const days = daysSinceCompletion(itin)
  return days !== null && days > FEEDBACK_SLA_DAYS
}

export type NpsMetrics = {
  eligible: number
  collected: number
  responseRate: number
  promoters: number
  passives: number
  detractors: number
  nps: number
  avg: { accommodation: number; transport: number; sightseeing: number; support: number }
}

/** Compute NPS + rating metrics across a set of (completed) bookings. */
export function computeNpsMetrics(itins: any[]): NpsMetrics {
  const eligibleList = itins.filter(isTripCompleted)
  const collectedList = eligibleList.filter(it => feedbackStatus(it.feedback) === "completed")
  const collected = collectedList.length
  let promoters = 0, passives = 0, detractors = 0
  const sum = { accommodation: 0, transport: 0, sightseeing: 0, support: 0 }
  for (const it of collectedList) {
    const cat = npsCategory(it.feedback?.npsScore)
    if (cat === "promoter") promoters++
    else if (cat === "passive") passives++
    else if (cat === "detractor") detractors++
    const r = it.feedback?.ratings || {}
    sum.accommodation += Number(r.accommodation) || 0
    sum.transport += Number(r.transport) || 0
    sum.sightseeing += Number(r.sightseeing) || 0
    sum.support += Number(r.support) || 0
  }
  const nps = collected > 0 ? Math.round(((promoters - detractors) / collected) * 100) : 0
  const avg = {
    accommodation: collected ? +(sum.accommodation / collected).toFixed(1) : 0,
    transport: collected ? +(sum.transport / collected).toFixed(1) : 0,
    sightseeing: collected ? +(sum.sightseeing / collected).toFixed(1) : 0,
    support: collected ? +(sum.support / collected).toFixed(1) : 0,
  }
  return {
    eligible: eligibleList.length,
    collected,
    responseRate: eligibleList.length ? Math.round((collected / eligibleList.length) * 100) : 0,
    promoters, passives, detractors, nps, avg,
  }
}
