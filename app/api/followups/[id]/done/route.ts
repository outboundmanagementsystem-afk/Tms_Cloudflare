import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { completeFollowupTask } from "@/lib/lead-engine/followup"

// POST /api/followups/:id/done — mark a follow-up step sent/done.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const db = await getDB()
  try {
    await completeFollowupTask(db, id, agent.uid)
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
