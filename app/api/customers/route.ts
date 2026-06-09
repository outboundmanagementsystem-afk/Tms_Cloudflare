import { getDB, queryRows, queryOne, execute, newId, now } from "@/lib/db"

export async function GET(req: Request) {
  const db = await getDB()
  const { searchParams } = new URL(req.url)
  const createdBy = searchParams.get("createdBy")
  const phone = searchParams.get("phone")

  if (phone) {
    const row = await queryOne(db, "SELECT * FROM customers WHERE phone = ? OR phone = ? LIMIT 1",
      [phone, phone.replace(/\D/g, "")])
    return Response.json(row || null)
  }

  let sql = "SELECT * FROM customers"
  const params: any[] = []
  if (createdBy) { sql += " WHERE created_by = ?"; params.push(createdBy) }
  sql += " ORDER BY created_at DESC"
  return Response.json(await queryRows(db, sql, params))
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = newId()
  await execute(db,
    `INSERT INTO customers (id,name,phone,email,created_by,created_by_name,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, body.name||"", body.phone||"", body.email||"", body.createdBy||"",
     body.createdByName||"", JSON.stringify(body), now(), now()]
  )
  return Response.json({ id })
}

export async function DELETE(req: Request) {
  const db = await getDB()
  const { searchParams } = new URL(req.url)
  if (searchParams.get("all") === "true") {
    await execute(db, "DELETE FROM customers")
  }
  return Response.json({ ok: true })
}
