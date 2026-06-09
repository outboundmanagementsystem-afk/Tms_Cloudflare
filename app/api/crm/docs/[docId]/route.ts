import { getDB, getR2, queryOne, execute } from "@/lib/db"
import { getAgent } from "@/lib/lead-engine/agent"

// GET /api/crm/docs/:docId — stream a lead document from R2 (owner-scoped).
export async function GET(req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return new Response("Unauthorized", { status: 401 })
  const { docId } = await ctx.params
  const db = await getDB()
  const doc = await queryOne<any>(db,
    "SELECT name, r2_key, content_type, owner_id FROM lead_documents WHERE id = ?", [docId])
  if (!doc || doc.ownerId !== agent.uid) return new Response("Not found", { status: 404 })
  const r2 = await getR2()
  const obj = await r2.get(doc.r2Key)
  if (!obj) return new Response("Not found", { status: 404 })
  const headers = new Headers()
  headers.set("Content-Type", doc.contentType || "application/octet-stream")
  headers.set("Content-Disposition", `inline; filename="${doc.name}"`)
  return new Response(obj.body, { headers })
}

// DELETE /api/crm/docs/:docId
export async function DELETE(req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const agent = await getAgent(req)
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { docId } = await ctx.params
  const db = await getDB()
  const doc = await queryOne<any>(db, "SELECT r2_key, owner_id FROM lead_documents WHERE id = ?", [docId])
  if (!doc || doc.ownerId !== agent.uid) return Response.json({ error: "Not found" }, { status: 404 })
  const r2 = await getR2()
  await r2.delete(doc.r2Key).catch(() => {})
  await execute(db, "DELETE FROM lead_documents WHERE id = ?", [docId])
  return Response.json({ ok: true })
}
