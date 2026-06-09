/**
 * Booking sanity checks — Aura Build Spec §8.
 *
 * These are computed in CODE (never by the model) and injected into the context
 * as reliable FACTS. The model only reads and explains them, so the ⚠ flags are
 * trustworthy, not guessed. This is also where the two known data bugs from the
 * audit are caught (wrong Final Payment Date, ₹NaN DMC cost).
 */

import { getSellPrice, getAmountPaid, fmt } from "./money"

const ADVANCE_RULE_PCT = 30 // SOP advance rule
const FINAL_PAYMENT_LEAD_DAYS = 7 // final payment due = arrival − 7

function parseDate(v: any): Date | null {
    if (!v) return null
    const s = String(v).split("T")[0]
    const d = new Date(s + "T00:00:00")
    return isNaN(d.getTime()) ? null : d
}

function toISO(d: Date): string {
    return d.toISOString().split("T")[0]
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export interface BookingFlags {
    flags: string[] // human-readable ⚠/ℹ notes, injected as facts
    advancePct: number | null
    balance: number
    expectedFinalPaymentDate: string | null
}

/**
 * Returns reliable, code-computed flags for one itinerary/booking.
 * `today` is passed in (callers stamp it) to keep this deterministic.
 */
export function computeBookingFlags(i: any, today: Date): BookingFlags {
    const flags: string[] = []
    const sell = getSellPrice(i)
    const paid = getAmountPaid(i)
    const balance = Math.max(0, sell - paid)
    const arrival = parseDate(i.startDate || i.arrivalDate || i.travelDate)

    // 1. Advance % vs 30% SOP rule
    let advancePct: number | null = null
    if (sell > 0) {
        advancePct = Math.round((paid / sell) * 100)
        if (advancePct < ADVANCE_RULE_PCT && paid > 0) {
            flags.push(
                `⚠ Advance is ${advancePct}% (${fmt(paid)} of ${fmt(sell)}) — below the SOP minimum of ${ADVANCE_RULE_PCT}%.`,
            )
        } else if (paid === 0) {
            flags.push(`ℹ No advance collected yet (SOP requires ${ADVANCE_RULE_PCT}% to confirm).`)
        }
    }

    // 2. Final Payment Date check (catch the known SLA bug: equals arrival)
    let expectedFinalPaymentDate: string | null = null
    if (arrival) {
        const expected = new Date(arrival)
        expected.setDate(expected.getDate() - FINAL_PAYMENT_LEAD_DAYS)
        expectedFinalPaymentDate = toISO(expected)
        const stored = parseDate(i.finalPaymentDate || i.finalPaymentDueDate || i.finalPayDate)
        if (stored) {
            if (toISO(stored) === toISO(arrival)) {
                flags.push(
                    `⚠ Final Payment Date is set to the arrival date (${toISO(arrival)}) — known SLA bug. It should be ${expectedFinalPaymentDate} (arrival − ${FINAL_PAYMENT_LEAD_DAYS} days).`,
                )
            } else if (toISO(stored) !== expectedFinalPaymentDate) {
                flags.push(
                    `⚠ Final Payment Date (${toISO(stored)}) does not match the SOP rule of arrival − ${FINAL_PAYMENT_LEAD_DAYS} days (${expectedFinalPaymentDate}).`,
                )
            }
        }
    }

    // 3. DMC cost parse check (catch the ₹NaN bug)
    if (i.dmcCost !== undefined && i.dmcCost !== null) {
        const n = Number(i.dmcCost)
        if (isNaN(n) || String(i.dmcCost).toLowerCase().includes("nan")) {
            flags.push(`⚠ DMC cost failed to parse (₹NaN) — do not trust it; re-check the source value.`)
        }
    }

    // 4. Stuck booking — still pre-arrival after the travel start date
    if (arrival && daysBetween(today, arrival) > 0) {
        if (!["post-ops", "completed", "cancelled"].includes(i.status)) {
            flags.push(
                `⚠ Stuck booking: travel start date (${toISO(arrival)}) has passed but status is still "${i.status || "draft"}".`,
            )
        }
    }

    // 5. Balance SLA — balance should be collected by Day 1 (arrival)
    if (arrival && balance > 0) {
        const daysToArrival = daysBetween(arrival, today)
        if (daysToArrival < 0) {
            flags.push(`⚠ Balance ${fmt(balance)} is OVERDUE (trip has started / passed).`)
        } else if (daysToArrival <= FINAL_PAYMENT_LEAD_DAYS) {
            flags.push(
                `ℹ Balance ${fmt(balance)} is due within ${daysToArrival} day(s) — final payment deadline approaching.`,
            )
        }
    }

    return { flags, advancePct, balance, expectedFinalPaymentDate }
}
