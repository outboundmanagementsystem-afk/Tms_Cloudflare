import { getDB, queryRows } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { captureLead } from "@/lib/lead-engine/engine"

// POST /api/leads — manual capture (also the core used by webhooks).
export async function POST(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.source) return Response.json({ error: "source is required" }, { status: 400 })
  const db = await getDB()
  const res = await captureLead(db, body)
  return Response.json({ ok: true, ...res })
}

// GET /api/leads?state=pooled — list (manager/debug).
export async function GET(req: Request) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const state = new URL(req.url).searchParams.get("state")
  const rows = state
    ? await queryRows(db, "SELECT * FROM leads WHERE state=? ORDER BY captured_at DESC LIMIT 200", [state])
    : await queryRows(db, "SELECT * FROM leads ORDER BY captured_at DESC LIMIT 200")
  return Response.json({ leads: rows })
}
