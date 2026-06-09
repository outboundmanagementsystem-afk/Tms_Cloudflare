import { getDB } from "@/lib/db"
import { getAgent, isSales } from "@/lib/lead-engine/agent"
import { onAgentLogin } from "@/lib/lead-engine/engine"

// POST /api/engine/login — marks the agent online and (sales only) allocates the
// login-gated morning batch (FR-MORN). Called once when Today's Work mounts.
export async function POST(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!isSales(agent.role)) return Response.json({ ok: true, allocated: 0, note: "not a sales agent" })
  const db = await getDB()
  const res = await onAgentLogin(db, agent.uid)
  return Response.json({ ok: true, ...res })
}
