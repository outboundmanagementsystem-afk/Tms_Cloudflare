import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { resolveEscalation } from "@/lib/lead-engine/engine"

const MANAGER = ["admin", "owner", "sales_lead"]

// POST /api/manager/escalation/:id/resolve — mark an escalation handled.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!MANAGER.includes(agent.role)) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const db = await getDB()
  await resolveEscalation(db, id, agent.uid)
  return Response.json({ ok: true })
}
