import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { addNote } from "@/lib/crm"

// POST /api/crm/leads/:id/note  { text }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const text = String(body.text || "").trim()
  if (!text) return Response.json({ error: "text required" }, { status: 400 })
  const db = await getDB()
  const res = await addNote(db, id, agent.uid, text)
  if (!res) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(res)
}
