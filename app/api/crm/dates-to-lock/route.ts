import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { datesToLock } from "@/lib/booking-date"

// GET /api/crm/dates-to-lock — the owner's "Booking Date Not Confirmed" leads with
// lock-due status (the batched, deduped "Dates to lock today" list — F10).
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const items = await datesToLock(db, agent.uid)
  return Response.json({ items })
}
