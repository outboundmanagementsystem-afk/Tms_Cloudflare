import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyJWT, getSecret } from "@/lib/jwt"

// Server-side API gate. Public pages (shared itinerary / voucher / invoice links) read a
// single record via GET without a session, so those stay open; everything else needs auth:
//   - all writes (POST/PUT/DELETE) on any /api route
//   - sensitive reads (lists, users, admin, finance-ish data, internal SOPs)
// /api/auth/* is always public (login/session/signout).
const SENSITIVE_GET = [
  "/api/users", "/api/customers", "/api/drafts", "/api/dmc",
  "/api/access-tokens", "/api/admin", "/api/chat", "/api/sops",
]

export const config = { matcher: ["/api/:path*"] }

function unauthorized() {
  return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { "content-type": "application/json" },
  })
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method

  if (pathname.startsWith("/api/auth/")) return NextResponse.next()
  // Channel webhooks authenticate via provider signature, not a session cookie.
  if (pathname.startsWith("/api/webhooks/")) return NextResponse.next()

  if (method === "GET" || method === "HEAD") {
    const needsAuth =
      pathname === "/api/itineraries" || // the "list everything" endpoint
      SENSITIVE_GET.some(p => pathname === p || pathname.startsWith(p + "/"))
    if (!needsAuth) return NextResponse.next() // public single-record reads, storage GET, destinations, packages
  }

  const token = req.cookies.get("token")?.value
  if (!token) return unauthorized()
  let secret: string
  try { secret = getSecret() } catch { return NextResponse.next() } // env misconfig — fail open rather than hard-lock
  const payload = await verifyJWT(token, secret)
  if (!payload) return unauthorized()
  return NextResponse.next()
}
