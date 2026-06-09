import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { dashboardData } from "@/lib/target-dashboard"

// GET /api/sales/target/dashboard — role-based target dashboard for the caller
// (Salesperson own card · Team Lead team breakdown · Manager org rollup).
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const data = await dashboardData(db, agent)
  return Response.json(data)
}
