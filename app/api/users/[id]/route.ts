import { getDB, queryOne, execute, buildUpdate, now } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth-server"

export async function GET(req: Request, ctx: { params: Promise<any> }) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth
  const params = await ctx.params;
  const db = await getDB()
  const user = await queryOne(db, "SELECT * FROM users WHERE uid = ?", [params.id])
  if (!user) return Response.json({ error: "Not found" }, { status: 404 })
  const { passwordHash, ...safe } = user as any
  return Response.json(safe)
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  const params = await ctx.params;
  const db = await getDB()
  const body = await req.json()
  // Never let the generic update touch the password hash (use /api/auth/set-password).
  const { setClauses, values } = buildUpdate({ ...body, updatedAt: now() }, ["passwordHash", "password_hash", "uid"])
  if (!setClauses.length) return Response.json({ ok: true })
  await execute(db, `UPDATE users SET ${setClauses.join(",")} WHERE uid = ?`, [...values, params.id])
  return Response.json({ ok: true })
}

export async function DELETE(req: Request, ctx: { params: Promise<any> }) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  const params = await ctx.params;
  const db = await getDB()
  await execute(db, "DELETE FROM users WHERE uid = ?", [params.id])
  return Response.json({ ok: true })
}
