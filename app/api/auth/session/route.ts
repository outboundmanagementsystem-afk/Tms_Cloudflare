import { verifyJWT, getSecret } from "@/lib/jwt"
import { getDB, queryOne } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || ""
    const token = cookie.split(";").map(c => c.trim()).find(c => c.startsWith("token="))?.split("=").slice(1).join("=")
    if (!token) return Response.json(null)

    const payload = await verifyJWT(token, getSecret())
    if (!payload) return Response.json(null)

    // Re-resolve the user from the DB by email so the profile always reflects current
    // data (uid + role). This heals JWTs that were minted before the Firebase→D1
    // migration, when the old login flow could store a uid different from the one the
    // itineraries reference (createdBy / assignedPreOpsId / leadId) — otherwise those
    // ownership-scoped views would show nothing. Email is never rewritten, so it's a
    // stable lookup key. Falls back to the token claims if D1 is unavailable.
    let u: any = null
    try {
      const db = await getDB()
      u = await queryOne(db, "SELECT * FROM users WHERE email = ?", [(payload.email || "").toLowerCase()])
    } catch { /* DB unavailable — use token claims */ }

    return Response.json({
      uid: u?.uid || payload.uid,
      email: u?.email || payload.email,
      name: u?.name || payload.name,
      // HRMS-issued tokens carry a `modules` claim and own the role (single
      // source of truth). TMS-native tokens keep self-healing (DB wins).
      role: (payload as { modules?: unknown }).modules ? (payload.role || u?.role) : (u?.role || payload.role),
      employeeCode: u?.employeeCode ?? payload.employeeCode ?? "",
      department: u?.department ?? payload.department ?? "",
      leadId: u?.leadId ?? payload.leadId ?? "",
      phone: u?.phone ?? payload.phone ?? "",
    })
  } catch {
    return Response.json(null)
  }
}
