import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { managerOverview } from "@/lib/lead-engine/engine"

const MANAGER = ["admin", "owner", "sales_lead"]

// GET /api/manager/overview — escalation queue, pool, agents, SLA breaches.
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!MANAGER.includes(agent.role)) return Response.json({ error: "Forbidden" }, { status: 403 })
  const db = await getDB()
  return Response.json(await managerOverview(db))
}
