// My Target — computes a sales agent's monthly goal progress from their
// confirmed itineraries (real TMS data). Sell price = selected plan's totalPrice.

import { queryRows, queryOne, execute } from "@/lib/db"

// "Closed/booked" statuses that count toward the target (confirmed and beyond).
export const CLOSED = ["confirmed", "handover", "pre-ops", "pre_ops", "ops", "post-ops", "post_ops", "completed", "booked"]
const DEFAULT_TARGET = 500000

export function istMonth(d: Date | string = new Date()): string {
  const dt = typeof d === "string" ? new Date(d) : d
  return new Date(dt.getTime() + 330 * 60_000).toISOString().slice(0, 7) // YYYY-MM (IST)
}

export function sellPrice(it: any): number {
  const plans = Array.isArray(it.plans) ? it.plans : []
  const sel = plans.find((p: any) => p.id === it.selectedPlanId) || plans[0] || {}
  return Number(sel.totalPrice || sel.total || sel.sellPrice || it.totalPrice || it.sellPrice || it.amountPaid || 0)
}

// Returns the set target, or null when a manager hasn't set one yet.
export async function getTarget(db: D1Database, agentId: string): Promise<number | null> {
  const row = await queryOne<any>(db, "SELECT target FROM sales_targets WHERE agent_id=? AND month=?", [agentId, istMonth()])
  return row?.target ?? null
}

export async function setTarget(db: D1Database, agentId: string, target: number) {
  await execute(db,
    "INSERT INTO sales_targets (agent_id, month, target, updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(agent_id, month) DO UPDATE SET target=excluded.target, updated_at=datetime('now')",
    [agentId, istMonth(), Math.max(0, Math.round(target))])
}

export async function computeTarget(db: D1Database, agentId: string) {
  const target = await getTarget(db, agentId)
  const month = istMonth()
  const ph = CLOSED.map(() => "?").join(",")

  // Pull this agent's confirmed itineraries for the last 6 IST months (one query).
  const since = istMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1))
  const rows = await queryRows<any>(db,
    `SELECT * FROM itineraries
     WHERE created_by = ? AND status IN (${ph})
       AND strftime('%Y-%m', created_at, '+330 minutes') >= ?
     ORDER BY created_at DESC`,
    [agentId, ...CLOSED, since])

  // This month's bookings + revenue.
  let achieved = 0
  const bookings: any[] = []
  const monthRevenue: Record<string, number> = {}
  for (const it of rows) {
    const mk = istMonth(it.createdAt || it.created_at)
    const amt = sellPrice(it)
    monthRevenue[mk] = (monthRevenue[mk] || 0) + amt
    if (mk === month) {
      achieved += amt
      bookings.push({
        id: it.id, customer: it.customerName || "Customer", destination: it.destination || "",
        nights: it.nights || 0, days: it.days || 0, code: it.quoteId || it.id?.slice(0, 8),
        amount: amt, status: it.status, date: it.createdAt || it.created_at,
      })
    }
  }

  // Last 6 month labels + revenue series.
  const series: { month: string; label: string; revenue: number }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mk = istMonth(d)
    series.push({ month: mk, label: d.toLocaleString("en-US", { month: "short" }), revenue: monthRevenue[mk] || 0 })
  }

  const ist = new Date(Date.now() + 330 * 60_000)
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const day = ist.getUTCDate()
  const daysLeft = Math.max(daysInMonth - day, 0)
  const balance = target != null ? Math.max(target - achieved, 0) : null

  return {
    target, achieved, bookings, series, daysInMonth, day, daysLeft, balance,
    bookingsCount: bookings.length,
    monthLabel: ist.toLocaleString("en-US", { month: "long" }) + " " + y,
  }
}
