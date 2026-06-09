import { getDB, queryOne, execute, now } from "@/lib/db"

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const row = await queryOne(db, "SELECT * FROM destinations WHERE id = ?", [params.id])
  if (!row) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(row)
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const body = await req.json()
  await execute(db,
    `UPDATE destinations SET name=?,country=?,description=?,data=?,updated_at=? WHERE id=?`,
    [body.name||"", body.country||"", body.description||"",
     JSON.stringify(body), now(), params.id]
  )
  return Response.json({ ok: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  await execute(db, "DELETE FROM destinations WHERE id = ?", [params.id])
  return Response.json({ ok: true })
}
