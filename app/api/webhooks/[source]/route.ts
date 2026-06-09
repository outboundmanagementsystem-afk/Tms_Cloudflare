import { getDB } from "@/lib/db"
import { captureLead, type CaptureInput } from "@/lib/lead-engine/engine"

// Channel webhook receiver: /api/webhooks/{instagram|facebook|whatsapp|google|generic}
//
// GET  → Meta subscription verification handshake (hub.challenge).
// POST → verify provider signature (X-Hub-Signature-256), map payload → captureLead.
//
// Credentials come from env (set when you connect a real channel):
//   META_VERIFY_TOKEN, META_APP_SECRET
// Until those are set, signature is skipped and generic JSON capture works for testing.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  const verifyToken = (globalThis as any).process?.env?.META_VERIFY_TOKEN || ""
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge || "", { status: 200 })
  }
  return new Response("Forbidden", { status: 403 })
}

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params
  const raw = await req.text()

  const appSecret = (globalThis as any).process?.env?.META_APP_SECRET || ""
  if (appSecret) {
    const ok = await verifyMetaSignature(appSecret, raw, req.headers.get("x-hub-signature-256") || "")
    if (!ok) return new Response("Invalid signature", { status: 401 })
  }

  let payload: any = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { /* non-JSON */ }

  const captures = mapToCaptures(source, payload)
  const db = await getDB()
  const results = []
  for (const c of captures) results.push(await captureLead(db, c))
  return Response.json({ ok: true, captured: results.length, results })
}

// ─── Signature ──────────────────────────────────────────────────
async function verifyMetaSignature(secret: string, body: string, header: string): Promise<boolean> {
  if (!header.startsWith("sha256=")) return false
  const expected = header.slice(7)
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
  return timingSafeEqual(hex, expected)
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── Payload → CaptureInput (provider-specific, best-effort) ─────
function mapToCaptures(source: string, payload: any): CaptureInput[] {
  // Generic / direct test shape: the body IS a CaptureInput (or { leads: [...] }).
  if (payload?.source || payload?.phone || payload?.contactName || payload?.handle) {
    return [{ ...payload, source: payload.source || source, rawPayload: payload }]
  }
  if (Array.isArray(payload?.leads)) {
    return payload.leads.map((l: any) => ({ ...l, source: l.source || source, rawPayload: l }))
  }

  // WhatsApp Cloud API (Meta): entry[].changes[].value.messages[]
  if (source === "whatsapp" && Array.isArray(payload?.entry)) {
    const out: CaptureInput[] = []
    for (const e of payload.entry) {
      for (const ch of e.changes || []) {
        const v = ch.value || {}
        const contacts = v.contacts || []
        for (const m of v.messages || []) {
          const name = contacts.find((c: any) => c.wa_id === m.from)?.profile?.name || ""
          out.push({
            source: "whatsapp", phone: m.from || "", contactName: name,
            destination: m.text?.body || "", rawPayload: m,
          })
        }
      }
    }
    return out
  }

  // Meta Lead Ads (Instagram/Facebook): entry[].changes[].value.field_data
  if ((source === "instagram" || source === "facebook") && Array.isArray(payload?.entry)) {
    const out: CaptureInput[] = []
    for (const e of payload.entry) {
      for (const ch of e.changes || []) {
        const fd: any[] = ch.value?.field_data || []
        const get = (n: string) => fd.find((f) => f.name === n)?.values?.[0]
        out.push({
          source, contactName: get("full_name") || get("name") || "",
          phone: get("phone_number") || "", destination: get("destination") || get("city") || "",
          budget: get("budget") ? Number(String(get("budget")).replace(/\D/g, "")) : null,
          rawPayload: ch.value,
        })
      }
    }
    if (out.length) return out
  }

  // Fallback: capture the raw payload so nothing is lost.
  return [{ source, rawPayload: payload }]
}
