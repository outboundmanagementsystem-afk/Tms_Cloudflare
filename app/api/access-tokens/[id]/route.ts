import { getDB, execute, now } from "@/lib/db"

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const body = await req.json()
  const { action, approvedBy, approvedByName } = body

  if (action === "approve") {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await execute(db,
      `UPDATE access_tokens SET status='approved',approved_by=?,approved_by_name=?,approved_at=?,expires_at=? WHERE id=?`,
      [approvedBy, approvedByName, now(), expiresAt, params.id]
    )
  } else if (action === "reject") {
    await execute(db,
      `UPDATE access_tokens SET status='rejected',approved_by=?,approved_by_name=?,approved_at=? WHERE id=?`,
      [approvedBy, approvedByName, now(), params.id]
    )
  }
  return Response.json({ ok: true })
}
