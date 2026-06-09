import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { quoteAlertsForAgent, processQuotes } from "@/lib/lead-engine/quotes"
import { loadConfig } from "@/lib/lead-engine/config"

// GET /api/crm/quotes/alerts — the owner's live pending-quote SLA status (banger feed).
// Advances ONLY the quote subsystem (bounded to open-quote leads) so breaches/reminders/
// escalations progress without the browser ever invoking the heavy full engine tick.
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const cfg = await loadConfig(db)
  await processQuotes(db, cfg).catch(() => {})
  const data = await quoteAlertsForAgent(db, agent.uid)
  return Response.json(data)
}
