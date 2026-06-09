import { verifyJWT, getSecret } from "@/lib/jwt"
import { getRoleDashboard } from "@/lib/role-utils"

// Single sign-on handoff from the Outbound Management hub.
// The hub sends the unified JWT (?token=...). We verify it with the shared
// secret, drop it into the same HttpOnly `token` cookie TMS already uses, and
// redirect to the role's dashboard. No password step — identity is owned by HRMS.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token") || ""

  let payload = null
  try { payload = token ? await verifyJWT(token, getSecret()) : null } catch { payload = null }
  if (!payload) {
    return new Response(null, { status: 302, headers: { Location: "/login" } })
  }

  const dest = getRoleDashboard(payload.role) // unknown role → /login
  const secure = url.protocol === "https:" ? " Secure;" : ""
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toUTCString()
  // On *.outbound.local scope the cookie to the parent so HRMS and TMS share
  // one session cookie (true cross-subdomain SSO).
  const domainAttr = url.hostname.endsWith("outbound.local") ? " Domain=.outbound.local;" : ""
  // NOT HttpOnly: the hub's Logout clears this cookie from JS (the HRMS shared
  // cookie is JS-managed too). HttpOnly here would make "sign out everywhere" fail.
  const headers = new Headers({ Location: dest })
  headers.append(
    "Set-Cookie",
    `token=${token}; Path=/;${domainAttr} SameSite=Lax;${secure} Expires=${expires}`,
  )
  return new Response(null, { status: 302, headers })
}
