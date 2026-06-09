/**
 * One-time fix: the 6 subcollection tables whose legacy Firestore sub-doc ids
 * collided under the flat global-PK schema (rows were lost to INSERT OR REPLACE).
 * Clears each table and re-inserts every array element keyed by parent + index,
 * so nothing is lost (including within-array duplicates).
 *
 *   node fix-subcollections.js --dry-run
 *   node fix-subcollections.js            (remote)
 *   node fix-subcollections.js --local
 */
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const SRC = process.env.IMPORT_SRC || "C:/Users/LENOVO/Downloads/outbound-tms-export-2026-06-02.json"
const DB_NAME = "outbound-tms"
const DRY_RUN = process.argv.includes("--dry-run")
const TARGET = process.argv.includes("--local") ? "--local" : "--remote"
const TMP_DIR = path.join(__dirname, ".fix-tmp")
const BATCH_SIZE = 400

function q(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "boolean") return v ? "1" : "0"
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const nowISO = () => new Date().toISOString()
let _batch = [], _fc = 0, n = 0
function emit(s) { _batch.push(s); if (_batch.length >= BATCH_SIZE) flush() }
function flush() {
  if (!_batch.length) return
  if (DRY_RUN) { _batch = []; return }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR)
  const f = path.join(TMP_DIR, `b_${String(_fc++).padStart(4, "0")}.sql`)
  fs.writeFileSync(f, "PRAGMA defer_foreign_keys=ON;\n" + _batch.join("\n"), "utf8")
  try { execSync(`npx wrangler d1 execute ${DB_NAME} ${TARGET} --file="${f}" --yes`, { stdio: "pipe" }); process.stdout.write(`  ✓ batch ${_fc}\r`) }
  catch (e) { console.error(`\n❌ batch ${_fc} failed:`, e.stdout?.toString() || e.stderr?.toString() || e.message); console.error(`   SQL at ${f}`); throw e }
  fs.unlinkSync(f); _batch = []
}

// table -> { parentKey, parentCol, tsCol|null }
const FIXES = [
  { coll: "itineraries", sub: "days",       table: "itinerary_days",       parentCol: "itinerary_id", tsCol: "created_at" },
  { coll: "itineraries", sub: "hotels",     table: "itinerary_hotels",     parentCol: "itinerary_id", tsCol: "created_at" },
  { coll: "itineraries", sub: "activities", table: "itinerary_activities", parentCol: "itinerary_id", tsCol: "created_at" },
  { coll: "packages",    sub: "hotels",     table: "package_hotels",       parentCol: "package_id",   tsCol: null },
  { coll: "packages",    sub: "activities", table: "package_activities",   parentCol: "package_id",   tsCol: null },
  { coll: "packages",    sub: "pricing",    table: "package_pricing",      parentCol: "package_id",   tsCol: null },
]

function main() {
  console.log(`\n🔧 Fix subcollections ${DRY_RUN ? "(DRY RUN)" : `(LIVE ${TARGET})`}\n   source: ${SRC}\n`)
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"))
  const stats = {}
  try {
    for (const fx of FIXES) {
      console.log(`▶ ${fx.table}…`)
      emit(`DELETE FROM ${fx.table};`)
      let count = 0
      for (const p of (data[fx.coll] || [])) {
        if (!p || typeof p !== "object" || !p.id) continue
        const items = Array.isArray(p[fx.sub]) ? p[fx.sub] : []
        let k = 0
        for (const it of items) {
          if (!it || typeof it !== "object") continue
          const id = `${p.id}__${fx.sub}_${k++}`
          if (fx.tsCol) {
            const ts = it.updatedAt || it.createdAt || nowISO()
            emit(`INSERT OR REPLACE INTO ${fx.table} (id,${fx.parentCol},data,${fx.tsCol}) VALUES (${q(id)},${q(p.id)},${q({ ...it, id })},${q(ts)});`)
          } else {
            emit(`INSERT OR REPLACE INTO ${fx.table} (id,${fx.parentCol},data) VALUES (${q(id)},${q(p.id)},${q({ ...it, id })});`)
          }
          count++
        }
      }
      flush()
      stats[fx.table] = count
    }
    console.log("\n\n✅ Fix complete!\n── Re-inserted ──")
    for (const [k, v] of Object.entries(stats)) console.log(`   ${k.padEnd(24)} ${v}`)
  } catch (e) {
    console.error("\n❌ aborted:", e.message); process.exitCode = 1
  } finally {
    if (!DRY_RUN && fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true })
  }
}
main()
