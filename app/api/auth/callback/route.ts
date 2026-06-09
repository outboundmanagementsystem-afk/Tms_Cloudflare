import { getDB, queryOne, execute, newId, now } from "@/lib/db"
import { signJWT } from "@/lib/jwt"

const OWNER_EMAIL = "ahamedshafeek12345@gmail.com"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  if (!code) return Response.redirect(`${url.origin}/login?error=no_code`)

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const jwtSecret = process.env.JWT_SECRET!
  const redirectUri = `${url.origin}/api/auth/callback`

  if (!clientId || !clientSecret || !jwtSecret) {
    return Response.redirect(`${url.origin}/login?error=server_config_missing`)
  }

  try {
    // Exchange code for Google tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    })
    const tokens = await tokenRes.json() as any
    if (!tokens.access_token) return Response.redirect(`${url.origin}/login?error=token_failed`)

    // Get Google user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const gUser = await userInfoRes.json() as any
    const { id: googleId, email, name, picture } = gUser
    if (!email) return Response.redirect(`${url.origin}/login?error=no_email`)

    const db = await getDB()

    // Find pre-registered user by email
    let user = await queryOne(db, "SELECT * FROM users WHERE email = ?", [email.toLowerCase()])

    if (!user) {
      // Only the owner email is allowed to self-register
      if (email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        const uid = googleId || newId()
        await execute(db,
          `INSERT OR REPLACE INTO users (uid,name,email,role,employee_code,created_at) VALUES (?,?,?,?,?,?)`,
          [uid, name || "Owner", email.toLowerCase(), "admin", "AD001", now()]
        )
        user = await queryOne(db, "SELECT * FROM users WHERE email = ?", [email.toLowerCase()])
      } else {
        return Response.redirect(`${url.origin}/login?error=access_denied`)
      }
    }

    const u = user as any

    // NOTE: uid is the stable internal primary key — it is intentionally NOT
    // overwritten with the Google account id here. Migrated data references users
    // by their stored uid (itineraries.created_by, users.lead_id, assigned_pre_ops_id,
    // customers.created_by, drafts.user_id); rewriting it on login would orphan all
    // of that. Users are resolved by email; the JWT carries whatever uid is stored.

    // Force owner email to admin role
    if (email.toLowerCase() === OWNER_EMAIL.toLowerCase() && u.role !== "admin") {
      await execute(db, "UPDATE users SET role = 'admin' WHERE uid = ?", [u.uid])
      u.role = "admin"
    }

    // Sign JWT — no DB write needed, token IS the session
    const jwt = await signJWT({
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role,
      employeeCode: u.employeeCode || "",
      department: u.department || "",
      leadId: u.leadId || "",
      phone: u.phone || "",
    }, jwtSecret, 7 * 24 * 3600) // 7 days

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
    const res = Response.redirect(`${url.origin}/`)
    res.headers.set("Set-Cookie", `token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt}`)
    return res
  } catch (err: any) {
    console.error("OAuth callback error:", err)
    return Response.redirect(`${url.origin}/login?error=server_error`)
  }
}
