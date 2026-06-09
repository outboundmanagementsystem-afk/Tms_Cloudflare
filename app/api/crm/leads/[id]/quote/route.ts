import { getDB } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"
import { sendLeadQuote } from "@/lib/crm"
import { ackQuote, startQuoteSla, extendQuote } from "@/lib/lead-engine/quotes"

// POST /api/crm/leads/:id/quote
//   { action:'send', channel?, docRef?, failed? }  → the real send (stops the SLA)
//   { action:'ack' }                                → quiet the popup (clock keeps running)
//   { action:'start' }                              → manually start the quote SLA
//   { action:'extend', minutes:30|60 }              → grant more time on a breached SLA
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = await getDB()
  const action = String(body.action || "send")

  if (action === "ack") {
    await ackQuote(db, id, agent.uid)
    return Response.json({ ok: true })
  }
  if (action === "start") {
    const r = await startQuoteSla(db, id, agent.uid)
    if (!r) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(r)
  }
  if (action === "extend") {
    const r = await extendQuote(db, id, agent.uid, Number(body.minutes) || 30)
    if (!r) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json(r)
  }
  // default: send (or flag a failed send)
  const res = await sendLeadQuote(db, id, agent.uid, { channel: body.channel, docRef: body.docRef, failed: !!body.failed })
  if (!res) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(res)
}
