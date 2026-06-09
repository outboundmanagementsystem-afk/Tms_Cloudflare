// DISABLED. Email-only sign-in (no password) was a security hole. The app now uses
// email + password via /api/auth/login. This endpoint is kept only so existing
// references don't 404; it never issues a session.
export async function POST() {
  return Response.json({ error: "Disabled. Use email + password to sign in." }, { status: 403 })
}
