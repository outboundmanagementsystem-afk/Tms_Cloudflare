import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { todaysWork } from "@/lib/lead-engine/engine"

// GET /api/engine/today — the Today's Work payload for the current agent.
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const data = await todaysWork(db, agent.uid)
  return Response.json({ agent: { uid: agent.uid, name: agent.name, role: agent.role }, ...data })
}
