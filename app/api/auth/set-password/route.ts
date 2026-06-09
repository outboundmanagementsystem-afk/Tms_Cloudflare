import { getDB, queryOne, execute, now } from "@/lib/db"
import { getAuthUser, isAdmin } from "@/lib/auth-server"
import { hashPassword, verifyPassword } from "@/lib/password"

// Set or reset a password.
//  - Admin/owner: may set any user's password (no current password needed).
//  - Any user: may change their OWN password (must supply the correct currentPassword,
//    unless they have none set yet).
export async function POST(req: Request) {
  const caller = await getAuthUser(req)
  if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { uid, email, newPassword, currentPassword } = await req.json().catch(() => ({}))
  if (!newPassword || String(newPassword).length < 6) {
    return Response.json({ error: "New password must be at least 6 characters" }, { status: 400 })
  }

  const db = await getDB()
  const target: any = uid
    ? await queryOne(db, "SELECT * FROM users WHERE uid = ?", [uid])
    : email
      ? await queryOne(db, "SELECT * FROM users WHERE email = ?", [String(email).toLowerCase().trim()])
      : await queryOne(db, "SELECT * FROM users WHERE uid = ?", [caller.uid])
  if (!target) return Response.json({ error: "User not found" }, { status: 404 })

  const settingOwn = target.uid === caller.uid
  if (!settingOwn && !isAdmin(caller)) {
    return Response.json({ error: "Forbidden — only admins can set another user's password" }, { status: 403 })
  }
  // A non-admin changing their own password must prove the current one (if one exists).
  if (settingOwn && !isAdmin(caller) && target.passwordHash) {
    const ok = await verifyPassword(currentPassword || "", target.passwordHash)
    if (!ok) return Response.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const hash = await hashPassword(String(newPassword))
  await execute(db, "UPDATE users SET password_hash = ?, updated_at = ? WHERE uid = ?", [hash, now(), target.uid])
  return Response.json({ ok: true })
}
