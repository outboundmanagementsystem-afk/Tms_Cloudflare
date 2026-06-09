import { getDB, queryOne } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { computeTarget, setTarget } from "@/lib/sales-target"

// GET /api/sales/target — the current agent's monthly goal progress.
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const data = await computeTarget(db, agent.uid)
  return Response.json({ agent: { name: agent.name }, ...data })
}

// POST /api/sales/target  { agentId, target } — set a target.
//   admin/owner (manager): may set ANY agent (team-lead row = team total, or a person).
//   sales_lead (team lead): may set ONLY their own team members (users.lead_id = caller).
//   sales: forbidden.
export async function POST(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const isManager = agent.role === "admin" || agent.role === "owner"
  const isLead = agent.role === "sales_lead"
  if (!isManager && !isLead) return Response.json({ error: "Only managers and team leads can set targets" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const agentId = body.agentId
  const target = Number(body.target)
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 })
  if (!(target >= 0)) return Response.json({ error: "valid target required" }, { status: 400 })
  const db = await getDB()

  // A team lead can only split to their own team members.
  if (isLead) {
    const u = await queryOne<any>(db, "SELECT lead_id FROM users WHERE uid=?", [agentId])
    if (!u || u.leadId !== agent.uid) {
      return Response.json({ error: "You can only set targets for your own team members." }, { status: 403 })
    }
  }
  await setTarget(db, agentId, target)
  return Response.json({ ok: true })
}
