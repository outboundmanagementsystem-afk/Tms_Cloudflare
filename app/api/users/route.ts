import { getDB, queryRows, queryOne, execute, newId, now } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth-server"

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth
  const db = await getDB()
  const users = await queryRows(db, "SELECT * FROM users ORDER BY created_at DESC")
  // Never expose password hashes
  const safe = (users as any[]).map(({ passwordHash, ...u }) => u)
  return Response.json(safe)
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  const db = await getDB()
  const body = await req.json()
  const id = body.uid || newId()
  await execute(db,
    `INSERT INTO users (uid,name,email,role,employee_code,department,lead_id,phone,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, role=excluded.role, employee_code=excluded.employee_code`,
    [id, body.name||"", (body.email||"").toLowerCase(), body.role||"sales",
     body.employeeCode||"", body.department||"", body.leadId||"",
     body.phone||"", now()]
  )
  // Return the ACTUAL stored uid (an ON CONFLICT update keeps the existing row's uid),
  // so the caller can reliably set the password right after creating the user.
  const row: any = await queryOne(db, "SELECT uid FROM users WHERE email = ?", [(body.email||"").toLowerCase()])
  return Response.json({ uid: row?.uid || id })
}
