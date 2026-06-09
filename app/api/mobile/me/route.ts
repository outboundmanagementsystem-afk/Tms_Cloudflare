import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { getMe } from "@/lib/mobile"

// GET /api/mobile/me — the logged-in employee's HRMS-sourced identity.
// Auth: HRMS JWT (verified by getAgent). Used by the mobile app right after login.
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const me = await getMe(db, agent.uid, agent.role)
  if (!me) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(me)
}
