import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { recordReply } from "@/lib/lead-engine/followup"

// POST /api/leads/:id/reply  { stage? } — customer replied → reset cadence + advance.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()
  await recordReply(db, id, agent.uid, body.stage)
  return Response.json({ ok: true })
}
