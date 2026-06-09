import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { manualAssign } from "@/lib/lead-engine/engine"

const MANAGER = ["admin", "owner", "sales_lead"]

// POST /api/manager/reassign  { leadId, agentId } — manager override assignment.
export async function POST(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!MANAGER.includes(agent.role)) return Response.json({ error: "Forbidden" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (!body.leadId || !body.agentId) return Response.json({ error: "leadId and agentId required" }, { status: 400 })
  const db = await getDB()
  try {
    await manualAssign(db, body.leadId, body.agentId, agent.uid)
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
