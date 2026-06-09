import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { getLeadDetail, applyAction, moveStage, deleteLead } from "@/lib/crm"

// GET /api/crm/leads/:id — full lead detail (overview + history + notes + documents).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const db = await getDB()
  const lead = await getLeadDetail(db, id, agent.uid)
  if (!lead) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(lead)
}

// PATCH /api/crm/leads/:id — workflow action, or a direct stage move.
//   { action:'callback'|'interested'|'notint', sub, note, reason, followUpAt, meetingAt, bookedValue }
//   { stage:'CTW' }  (drag/drop move)
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()
  const res = body.action
    ? await applyAction(db, id, agent.uid, body)
    : await moveStage(db, id, agent.uid, body.stage)
  if (!res) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(res)
}

// DELETE /api/crm/leads/:id
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const db = await getDB()
  const ok = await deleteLead(db, id, agent.uid)
  return Response.json({ ok })
}
