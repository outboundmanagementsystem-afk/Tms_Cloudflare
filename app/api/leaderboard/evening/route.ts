import { getDB, queryRows } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"

// GET /api/leaderboard/evening — deals won from after-hours (evening) leads, by agent.
// Drives the "Evening Leads" highlight (FR-DASH-2 / G6).
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const leaders = await queryRows<any>(db,
    `SELECT u.name AS name, COUNT(*) AS eveningWins
     FROM leads l JOIN users u ON u.uid = l.owner_id
     WHERE l.state='won'
       AND ( CAST(strftime('%H', l.captured_at, '+330 minutes') AS INTEGER) >= 18
          OR CAST(strftime('%H', l.captured_at, '+330 minutes') AS INTEGER) < 9 )
     GROUP BY l.owner_id ORDER BY eveningWins DESC LIMIT 20`)
  return Response.json({ leaders })
}
