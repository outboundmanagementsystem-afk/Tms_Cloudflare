import { getDB, queryRows, execute, newId, now } from "@/lib/db"

export async function GET() {
  const db = await getDB()
  const rows = await queryRows(db, "SELECT * FROM packages ORDER BY created_at DESC")
  return Response.json(rows)
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = newId()
  await execute(db,
    `INSERT INTO packages (id,name,destination,data,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    [id, body.name||"", body.destination||"", JSON.stringify(body), now(), now()]
  )
  return Response.json({ id })
}
