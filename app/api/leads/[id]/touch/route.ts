import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { recordTouch, backfillForAgent } from "@/lib/lead-engine/engine"

// POST /api/leads/:id/touch  { type, channel?, detail? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()
  try {
    await recordTouch(db, id, agent.uid, body.type || "note", body.channel || "", body.detail || "")
    // Clearing a lead frees a WIP slot → backfill so the agent stays busy (FR-LIVE-9).
    await backfillForAgent(db, agent.uid)
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
