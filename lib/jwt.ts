// JWT sign / verify using Web Crypto API (HS256)
// Works in Cloudflare Workers edge runtime — no external dependency needed.

export interface JWTPayload {
  uid: string
  email: string
  name: string
  role: string
  employeeCode?: string
  department?: string
  leadId?: string
  phone?: string
  iat?: number
  exp?: number
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signJWT(payload: JWTPayload, secret: string, expirySeconds = 7 * 24 * 3600): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: now, exp: now + expirySeconds })))
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(sig)}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [header, body, sig] = token.split(".")
    if (!header || !body || !sig) return null
    // Pin the algorithm — reject anything that isn't HS256.
    try {
      const h = JSON.parse(new TextDecoder().decode(b64urlDecode(header)))
      if (h?.alg !== "HS256") return null
    } catch { return null }
    const key = await importKey(secret)
    const valid = await crypto.subtle.verify(
      "HMAC", key,
      b64urlDecode(sig),
      new TextEncoder().encode(`${header}.${body}`)
    )
    if (!valid) return null
    const payload: JWTPayload & { exp?: number } = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error("JWT_SECRET env variable is not set")
  return s
}
