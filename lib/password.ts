// Password hashing for the Cloudflare Workers runtime.
// bcrypt/argon2 native modules don't run on Workers, so we use PBKDF2-HMAC-SHA256
// via Web Crypto. Stored format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`.

const ITERATIONS = 100_000
const KEYLEN_BITS = 256

const toB64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, KEYLEN_BITS)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toB64(salt.buffer)}$${toB64(hash.buffer)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = (stored || "").split("$")
    if (scheme !== "pbkdf2" || !saltB64 || !hashB64) return false
    const iterations = parseInt(iterStr, 10) || ITERATIONS
    const expected = fromB64(hashB64)
    const actual = await derive(password, fromB64(saltB64), iterations)
    if (actual.length !== expected.length) return false
    // constant-time comparison
    let diff = 0
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
    return diff === 0
  } catch {
    return false
  }
}
