
export async function POST() {
  const res = Response.json({ ok: true })
  // Clear JWT cookie
  res.headers.set("Set-Cookie", "token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
  return res
}
