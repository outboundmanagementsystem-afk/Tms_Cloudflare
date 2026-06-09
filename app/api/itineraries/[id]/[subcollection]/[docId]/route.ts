import { getDB, queryOne, execute, now } from "@/lib/db"

const TABLE: Record<string, string> = {
  days:             "itinerary_days",
  hotels:           "itinerary_hotels",
  flights:          "itinerary_flights",
  transfers:        "itinerary_transfers",
  activities:       "itinerary_activities",
  pricing:          "itinerary_pricing",
  payments:         "itinerary_payments",
  sopChecklist:     "itinerary_sop_checklist",
  postOpsChecklist: "itinerary_post_ops_checklist",
  salesChecklist:   "itinerary_sales_checklist",
  tripNotes:        "itinerary_trip_notes",
}

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const row = await queryOne(db, `SELECT * FROM ${table} WHERE id = ? AND itinerary_id = ?`, [params.docId, params.id])
  if (!row) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(row)
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const body = await req.json()
  // Read the RAW `data` column for patch semantics. NOTE: queryOne/queryRows run
  // expandData(), which strips `data` off the row — using them here made `merged`
  // always {}, so a partial update (e.g. a checklist toggle sending only {checked})
  // overwrote the row and wiped the item's title/type/category. Read it directly.
  const row: any = await db.prepare(`SELECT data FROM ${table} WHERE id = ? AND itinerary_id = ?`)
    .bind(params.docId, params.id).first()
  let merged: any = {}
  if (row && typeof row.data === "string") {
    try { merged = JSON.parse(row.data) } catch { merged = {} }
  }
  Object.assign(merged, body, { id: params.docId })
  await execute(db,
    `UPDATE ${table} SET data = ?, updated_at = ? WHERE id = ? AND itinerary_id = ?`,
    [JSON.stringify(merged), now(), params.docId, params.id]
  )
  return Response.json({ ok: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  await execute(db, `DELETE FROM ${table} WHERE id = ? AND itinerary_id = ?`, [params.docId, params.id])
  return Response.json({ ok: true })
}
