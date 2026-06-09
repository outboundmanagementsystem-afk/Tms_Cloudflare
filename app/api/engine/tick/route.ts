import { getDB } from "@/lib/db"
import { tick } from "@/lib/lead-engine/engine"

// The time-driven engine pass (SLA breaches, reassignment ladder, morning deadline,
// 17:30 cutoff, hot-lead alerts, anti-hoarding). Server-side, idempotent (NFR-1/4).
// In production a Cloudflare Cron Trigger hits this every minute; in dev the
// Today's Work page polls it while open.
async function run() {
  try {
    const db = await getDB()
    const res = await tick(db)
    return Response.json({ ok: true, ...res })
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e), stack: String(e?.stack || "").split("\n").slice(0, 8) }, { status: 500 })
  }
}

export async function POST() { return run() }
export async function GET() { return run() }
