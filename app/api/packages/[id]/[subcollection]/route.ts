import { getDB, queryRows, execute, newId, now } from "@/lib/db"

const TABLE: Record<string, string> = {
  days:       "package_days",
  hotels:     "package_hotels",
  flights:    "package_flights",
  transfers:  "package_transfers",
  activities: "package_activities",
  pricing:    "package_pricing",
}

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  return Response.json(await queryRows(db, `SELECT * FROM ${table} WHERE package_id = ?`, [params.id]))
}

export async function POST(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const body = await req.json()
  const id = body.id || newId()
  await execute(db, `INSERT INTO ${table} (id,package_id,data) VALUES (?,?,?)`,
    [id, params.id, JSON.stringify({ ...body, id })])
  return Response.json({ id })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  await execute(db, `DELETE FROM ${table} WHERE package_id = ?`, [params.id])
  return Response.json({ ok: true })
}
