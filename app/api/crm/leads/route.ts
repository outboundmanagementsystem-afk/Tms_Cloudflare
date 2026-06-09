import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { getAuthUser } from "@/lib/auth-server"
import { listMyLeadsByEmail, createManualLead, STAGES } from "@/lib/crm"

// GET /api/crm/leads — the current rep's leads, grouped into the 13 Kanban columns.
// Auth is JWT-only (no DB) and the owner uid is resolved inside the leads query, so
// the whole board loads in a single remote D1 round trip.
export async function GET(req: Request) {
  const payload = await getAuthUser(req) as any
  if (!payload) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const data = await listMyLeadsByEmail(db, payload.email || "", payload.uid || "")
  return Response.json({ stages: STAGES, agent: { name: payload.name || "" }, ...data })
}

// POST /api/crm/leads — manually add a lead (owned by the rep, stage NEW).
export async function POST(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.contactName && !body.phone) return Response.json({ error: "Name or phone required" }, { status: 400 })
  const db = await getDB()
  const id = await createManualLead(db, agent.uid, body)
  return Response.json({ ok: true, id })
}
