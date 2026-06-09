import { getDB, getR2, newId, now, queryRows, queryOne, execute } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"

// GET /api/crm/leads/:id/docs — list documents for a lead the rep owns.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const db = await getDB()
  const own = await queryOne<any>(db, "SELECT id FROM leads WHERE id = ? AND owner_id = ?", [id, agent.uid])
  if (!own) return Response.json({ error: "Not found" }, { status: 404 })
  const docs = await queryRows<any>(db,
    "SELECT id, name, size, content_type, created_at FROM lead_documents WHERE lead_id = ? ORDER BY created_at DESC", [id])
  return Response.json({ documents: docs.map((d: any) => ({ id: d.id, name: d.name, size: d.size, contentType: d.contentType, at: d.createdAt })) })
}

// POST /api/crm/leads/:id/docs — upload a file (multipart form-data, field "file") to R2.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const db = await getDB()
  const own = await queryOne<any>(db, "SELECT id FROM leads WHERE id = ? AND owner_id = ?", [id, agent.uid])
  if (!own) return Response.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file") as File | null
  if (!file) return Response.json({ error: "file required" }, { status: 400 })

  const docId = newId()
  const key = `leads/${id}/${docId}-${file.name}`
  const r2 = await getR2()
  const buf = await file.arrayBuffer()
  await r2.put(key, buf, { httpMetadata: { contentType: file.type || "application/octet-stream" } })
  await execute(db,
    `INSERT INTO lead_documents (id, lead_id, owner_id, name, r2_key, size, content_type, uploaded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [docId, id, agent.uid, file.name, key, file.size || buf.byteLength, file.type || "application/octet-stream", agent.uid, now()])
  await execute(db,
    "INSERT INTO touch_events (id, lead_id, agent_id, type, channel, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    [newId(), id, agent.uid, "note", "", `Uploaded document: ${file.name}`, now()])
  return Response.json({ ok: true, id: docId, name: file.name })
}
