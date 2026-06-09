import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { enterDateUnconfirmed, confirmTravelDate } from "@/lib/booking-date"

// POST /api/crm/leads/:id/booking-date
//   { action:'enter',   estimatedDate, granularity }  → move into "Booking Date Not Confirmed"
//   { action:'confirm', date }                         → lock the real date (single source of truth)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()

  const res = body.action === "confirm"
    ? await confirmTravelDate(db, id, agent.uid, String(body.date || ""))
    : await enterDateUnconfirmed(db, id, agent.uid, String(body.estimatedDate || ""), body.granularity || "exact")

  if (!res) return Response.json({ error: "Not found" }, { status: 404 })
  if ((res as any).error) return Response.json(res, { status: 400 })
  return Response.json(res)
}
