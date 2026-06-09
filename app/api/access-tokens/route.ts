import { getDB, queryRows, execute, newId, now } from "@/lib/db"

export async function GET(req: Request) {
  const db = await getDB()
  const { searchParams } = new URL(req.url)
  const itineraryId = searchParams.get("itineraryId")
  const status = searchParams.get("status")
  const requestedBy = searchParams.get("requestedBy")

  let sql = "SELECT * FROM access_tokens WHERE 1=1"
  const params: any[] = []
  if (itineraryId) { sql += " AND itinerary_id = ?"; params.push(itineraryId) }
  if (status) { sql += " AND status = ?"; params.push(status) }
  if (requestedBy) { sql += " AND requested_by = ?"; params.push(requestedBy) }
  sql += " ORDER BY requested_at DESC"
  return Response.json(await queryRows(db, sql, params))
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = newId()
  await execute(db,
    `INSERT INTO access_tokens (id,itinerary_id,requested_by,requested_by_name,requested_by_role,reason,status,requested_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, body.itineraryId, body.requestedBy, body.requestedByName,
     body.requestedByRole, body.reason, "pending", now()]
  )
  return Response.json({ id })
}
