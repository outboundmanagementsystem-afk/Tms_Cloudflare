import { getDB, queryRows, execute, newId, now } from "@/lib/db"

export async function GET(req: Request) {
  const db = await getDB()
  const userId = new URL(req.url).searchParams.get("userId")
  if (!userId) return Response.json([])
  return Response.json(await queryRows(db, "SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC", [userId]))
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = body.id || newId()
  await execute(db,
    `INSERT INTO drafts (id,user_id,data,created_at,updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
    [id, body.userId||"", JSON.stringify(body), now(), now()]
  )
  return Response.json({ id })
}
