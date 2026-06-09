import { getDB, queryOne, execute, now } from "@/lib/db"

const TABLE: Record<string, string> = {
  days:"package_days", hotels:"package_hotels", flights:"package_flights",
  transfers:"package_transfers", activities:"package_activities", pricing:"package_pricing",
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const body = await req.json()
  const existing = await queryOne(db, `SELECT data FROM ${table} WHERE id = ? AND package_id = ?`, [params.docId, params.id])
  let merged: any = {}
  if (existing) { try { merged = JSON.parse((existing as any).data || "{}") } catch { merged = {} } }
  Object.assign(merged, body, { id: params.docId })
  await execute(db, `UPDATE ${table} SET data = ? WHERE id = ? AND package_id = ?`, [JSON.stringify(merged), params.docId, params.id])
  return Response.json({ ok: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  await execute(db, `DELETE FROM ${table} WHERE id = ? AND package_id = ?`, [params.docId, params.id])
  return Response.json({ ok: true })
}
