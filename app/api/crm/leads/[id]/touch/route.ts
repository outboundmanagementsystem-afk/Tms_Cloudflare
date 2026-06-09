import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { logTouch } from "@/lib/crm"

// POST /api/crm/leads/:id/touch  { type:'call'|'whatsapp'|'email', detail? }
// Logs a contact attempt from the drawer's action circles.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const type = String(body.type || "note")
  const db = await getDB()
  const res = await logTouch(db, id, agent.uid, type, type, body.detail || "")
  if (!res) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(res)
}
