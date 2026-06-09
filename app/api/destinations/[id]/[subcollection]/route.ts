import { getDB, queryRows, execute, newId, now } from "@/lib/db"

const TABLE: Record<string, string> = {
  hotels:       "destination_hotels",
  activities:   "destination_activities",
  transfers:    "destination_transfers",
  vehicleRules: "destination_vehicle_rules",
  dayPlans:     "destination_day_plans",
  attractions:  "destination_attractions",
}

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const rows = await queryRows(db, `SELECT * FROM ${table} WHERE destination_id = ?`, [params.id])
  return Response.json(rows)
}

export async function POST(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const body = await req.json()
  const id = body.id || newId()
  await execute(db,
    `INSERT INTO ${table} (id, destination_id, data, created_at) VALUES (?,?,?,?)`,
    [id, params.id, JSON.stringify({ ...body, id }), now()]
  )
  return Response.json({ id })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  await execute(db, `DELETE FROM ${table} WHERE destination_id = ?`, [params.id])
  return Response.json({ ok: true })
}
