import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { advanceLead } from "@/lib/lead-engine/engine"

// POST /api/leads/:id/state  { state, stage? } — advance to won/lost/etc.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (!body.state) return Response.json({ error: "state required" }, { status: 400 })
  const db = await getDB()
  try {
    await advanceLead(db, id, agent.uid, body.state, body.stage)
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
