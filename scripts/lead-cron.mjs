// Local engine heartbeat — runs the lead-engine tick every minute so SLAs,
// the 11:00 deadline, escalations and follow-ups fire even when no page is open.
//
//   node scripts/lead-cron.mjs                       # hits localhost:8788
//   TICK_URL=https://tms.example.com/api/engine/tick node scripts/lead-cron.mjs
//
// In production, replace this with a Cloudflare Cron Trigger hitting the same URL.

const URL = process.env.TICK_URL || "http://localhost:8788/api/engine/tick"
const EVERY_MS = Number(process.env.TICK_EVERY_MS || 60_000)

async function tick() {
  try {
    const r = await fetch(URL, { method: "GET" })
    const j = await r.json().catch(() => ({}))
    console.log(new Date().toISOString(), r.status, JSON.stringify(j))
  } catch (e) {
    console.error(new Date().toISOString(), "tick failed:", e.message)
  }
}

console.log(`lead-cron → ${URL} every ${EVERY_MS / 1000}s`)
tick()
setInterval(tick, EVERY_MS)
