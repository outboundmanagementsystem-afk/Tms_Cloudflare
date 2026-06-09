import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { listLeads } from "@/lib/mobile"

// GET /api/mobile/leads — leads assigned to the logged-in salesperson (owner-scoped).
// Lead ownership + reassignment in TMS are reflected automatically (just a filter).
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const leads = await listLeads(db, agent.uid)
  return Response.json({ leads, count: leads.length })
}
