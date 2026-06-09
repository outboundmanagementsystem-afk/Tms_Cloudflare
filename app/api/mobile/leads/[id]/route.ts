import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { getLeadDetail } from "@/lib/mobile"
import { moveStage, addNote } from "@/lib/crm"

// GET /api/mobile/leads/:id — lead detail (owner-scoped; 404 if not theirs).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const db = await getDB()
  const lead = await getLeadDetail(db, id, agent.uid)
  if (!lead) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(lead)
}

// PATCH /api/mobile/leads/:id — update the lead's stage, or add a note. Owner-scoped.
//   { stage:'CALLBACK' }  |  { note:'...' }
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()
  if (body.note) {
    const r = await addNote(db, id, agent.uid, String(body.note))
    if (!r) return Response.json({ error: "Not found" }, { status: 404 })
  }
  if (body.stage) {
    const r = await moveStage(db, id, agent.uid, String(body.stage))
    if (!r) return Response.json({ error: "Not found" }, { status: 404 })
  }
  const lead = await getLeadDetail(db, id, agent.uid)
  return Response.json(lead)
}
