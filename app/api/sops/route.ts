import { getDB, queryRows, execute, newId, now } from "@/lib/db"

export async function GET(req: Request) {
  const db = await getDB()
  const dept = new URL(req.url).searchParams.get("department")
  const sql = dept ? "SELECT * FROM sops WHERE department = ?" : "SELECT * FROM sops"
  return Response.json(await queryRows(db, sql, dept ? [dept] : []))
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = newId()
  await execute(db,
    `INSERT INTO sops (id,title,department,items,whatsapp_template,stage,categories,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, body.title||"", body.department||"", JSON.stringify(body.items||[]),
     body.whatsappTemplate||"", body.stage||"", JSON.stringify(body.categories||[]),
     now(), now()]
  )
  return Response.json({ id })
}
