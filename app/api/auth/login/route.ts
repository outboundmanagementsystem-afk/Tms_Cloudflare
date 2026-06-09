import { getDB, queryOne } from "@/lib/db"
import { signJWT, getSecret } from "@/lib/jwt"
import { verifyPassword } from "@/lib/password"

// Email + password sign-in → issues the session JWT (HttpOnly cookie).
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json().catch(() => ({}))
    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 })
    }
    let secret: string
    try { secret = getSecret() } catch { return Response.json({ error: "Server not configured" }, { status: 500 }) }

    const db = await getDB()
    const u: any = await queryOne(db, "SELECT * FROM users WHERE email = ?", [String(email).toLowerCase().trim()])
    // Generic message — don't reveal whether the email exists or the password is wrong.
    if (!u || !u.passwordHash) return Response.json({ error: "Invalid email or password" }, { status: 401 })

    const ok = await verifyPassword(password, u.passwordHash)
    if (!ok) return Response.json({ error: "Invalid email or password" }, { status: 401 })

    const jwt = await signJWT({
      uid: u.uid, email: u.email, name: u.name, role: u.role,
      employeeCode: u.employeeCode || "", department: u.department || "",
      leadId: u.leadId || "", phone: u.phone || "",
    }, secret, 7 * 24 * 3600)

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
    // Add Secure only over HTTPS (so the cookie still saves on http://localhost during dev).
    const proto = req.headers.get("x-forwarded-proto") || (() => { try { return new URL(req.url).protocol.replace(":", "") } catch { return "http" } })()
    const secure = proto === "https" ? " Secure;" : ""
    const res = Response.json({ ok: true, user: { uid: u.uid, email: u.email, name: u.name, role: u.role } })
    res.headers.set("Set-Cookie", `token=${jwt}; Path=/; HttpOnly; SameSite=Lax;${secure} Expires=${expiresAt}`)
    return res
  } catch (e: any) {
    return Response.json({ error: e?.message || "Login failed" }, { status: 500 })
  }
}
