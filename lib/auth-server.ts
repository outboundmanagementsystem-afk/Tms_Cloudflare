// Server-side auth helpers for API routes. Extract + verify the JWT from the cookie.
import { verifyJWT, getSecret, type JWTPayload } from "@/lib/jwt"

export function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") || ""
  const token = cookie.split(";").map(c => c.trim()).find(c => c.startsWith("token="))?.split("=").slice(1).join("=")
  return token || null
}

/** Returns the verified JWT payload, or null if missing/invalid. */
export async function getAuthUser(req: Request): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(req)
  if (!token) return null
  try {
    return await verifyJWT(token, getSecret())
  } catch {
    return null
  }
}

export function isAdmin(payload: JWTPayload | null): boolean {
  return !!payload && (payload.role === "admin" || payload.role === "owner")
}

/** 401 if not authenticated. Usage: `const u = await requireAuth(req); if (u instanceof Response) return u` */
export async function requireAuth(req: Request): Promise<JWTPayload | Response> {
  const user = await getAuthUser(req)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return user
}

/** 401/403 unless the caller is admin/owner. */
export async function requireAdmin(req: Request): Promise<JWTPayload | Response> {
  const user = await getAuthUser(req)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(user)) return Response.json({ error: "Forbidden — admin only" }, { status: 403 })
  return user
}
