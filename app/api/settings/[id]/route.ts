import { getDB, queryOne, execute, now } from "@/lib/db"

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const row = await queryOne(db, "SELECT * FROM settings WHERE id = ?", [params.id])
  if (!row) return Response.json(null)
  return Response.json(row)
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const body = await req.json()
  await execute(db,
    `INSERT INTO settings (id, data) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    [params.id, JSON.stringify(body)]
  )
  return Response.json({ ok: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  await execute(db, "DELETE FROM settings WHERE id = ?", [params.id])
  return Response.json({ ok: true })
}
