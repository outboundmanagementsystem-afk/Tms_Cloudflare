/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Firebase JSON export  →  Cloudflare D1   FULL DATA IMPORT
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reads a static Firebase/Firestore JSON export (the file is a single object
 *  whose top-level keys are collection names, each an array of documents with
 *  subcollections nested inline as arrays) and loads EVERYTHING into D1.
 *
 *  No Firebase connection / no read quota needed — works entirely off the file.
 *
 *  IDs are preserved exactly (users.uid, doc.id) so all ownership/links survive.
 *  Each doc keeps mapped columns (for queries) + a JSON blob (lossless catch-all).
 *  Nested subcollection arrays are exploded into their dedicated *_<sub> tables.
 *
 *  ── RUN ─────────────────────────────────────────────────────────────────────
 *      node import-from-json.js --dry-run        count only, write nothing
 *      node import-from-json.js --local          import into LOCAL D1
 *      node import-from-json.js                   import into REMOTE D1 (live)
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const SRC = process.env.IMPORT_SRC || "C:/Users/LENOVO/Downloads/outbound-tms-export-2026-06-02.json"
const DB_NAME = "outbound-tms"
const DRY_RUN = process.argv.includes("--dry-run")
const TARGET = process.argv.includes("--local") ? "--local" : "--remote"
const TMP_DIR = path.join(__dirname, ".import-tmp")
const BATCH_SIZE = 400 // statements per wrangler call

// ── SQL value helpers ─────────────────────────────────────────────────────────
function q(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "boolean") return v ? "1" : "0"
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const nowISO = () => new Date().toISOString()
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const bool = (v) => (v ? 1 : 0)
/** strip the given keys from a shallow copy of obj */
const omit = (obj, keys) => { const c = { ...obj }; for (const k of keys) delete c[k]; return c }

// ── Batch flushing ─────────────────────────────────────────────────────────────
let _batch = []
let _fileCounter = 0
const stats = {}
function bump(k, n = 1) { stats[k] = (stats[k] || 0) + n }

function emit(sql) {
  _batch.push(sql)
  if (_batch.length >= BATCH_SIZE) flush()
}
function flush() {
  if (_batch.length === 0) return
  if (DRY_RUN) { _batch = []; return }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR)
  const file = path.join(TMP_DIR, `batch_${String(_fileCounter++).padStart(4, "0")}.sql`)
  // wrap each batch in a transaction for speed + atomicity
  fs.writeFileSync(file, "PRAGMA defer_foreign_keys=ON;\n" + _batch.join("\n"), "utf8")
  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} ${TARGET} --file="${file}" --yes`, { stdio: "pipe" })
    process.stdout.write(`  ✓ batch ${_fileCounter} (${_batch.length} stmts)\r`)
  } catch (err) {
    console.error(`\n❌  Batch ${_fileCounter} failed:`, err.stdout?.toString() || err.stderr?.toString() || err.message)
    console.error(`    SQL saved at: ${file} (inspect & retry manually if needed)`)
    throw err
  }
  fs.unlinkSync(file)
  _batch = []
}

// ── Subcollection maps ──────────────────────────────────────────────────────────
const DEST_SUBS = {
  hotels: "destination_hotels", activities: "destination_activities",
  transfers: "destination_transfers", vehicleRules: "destination_vehicle_rules",
  dayPlans: "destination_day_plans", attractions: "destination_attractions",
}
const ITIN_SUBS = {
  days: "itinerary_days", hotels: "itinerary_hotels", flights: "itinerary_flights",
  transfers: "itinerary_transfers", activities: "itinerary_activities", pricing: "itinerary_pricing",
  payments: "itinerary_payments", sopChecklist: "itinerary_sop_checklist",
  postOpsChecklist: "itinerary_post_ops_checklist", salesChecklist: "itinerary_sales_checklist",
  tripNotes: "itinerary_trip_notes",
}
// These checklist tables have an `updated_at` column instead of `created_at`.
const ITIN_SUBS_UPDATED_AT = new Set(["itinerary_sop_checklist", "itinerary_post_ops_checklist", "itinerary_sales_checklist"])
const PKG_SUBS = {
  days: "package_days", hotels: "package_hotels", flights: "package_flights",
  transfers: "package_transfers", activities: "package_activities", pricing: "package_pricing",
}

// ── Importers ─────────────────────────────────────────────────────────────────
function importUsers(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object") continue
    const uid = d.uid || d.id
    if (!uid) continue
    emit(`INSERT OR REPLACE INTO users (uid,name,email,role,employee_code,department,lead_id,phone,status,on_leave,inactive,disabled,password_hash,created_at,updated_at) VALUES (${q(uid)},${q(d.name || "")},${q((d.email || "").toLowerCase())},${q(d.role || "sales")},${q(d.employeeCode || "")},${q(d.department || "")},${q(d.leadId || "")},${q(d.phone || "")},${q(d.status || "active")},${bool(d.onLeave)},${bool(d.inactive)},${bool(d.disabled)},${q("")},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("users")
  }
}

function importDestinations(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    const id = d.id
    const blob = omit(d, Object.keys(DEST_SUBS)) // keep subDestinations/customHotelCategories/pdfTemplate; drop subcollection arrays
    emit(`INSERT OR REPLACE INTO destinations (id,name,country,description,data,created_at,updated_at) VALUES (${q(id)},${q(d.name || d.destinationName || "")},${q(d.country || "")},${q(d.description || "")},${q(blob)},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("destinations")
    for (const [sub, table] of Object.entries(DEST_SUBS)) {
      const items = Array.isArray(d[sub]) ? d[sub] : []
      for (const it of items) {
        if (!it || typeof it !== "object") continue
        const itId = it.id || `${id}_${sub}_${bump.n = (bump.n || 0) + 1}`
        emit(`INSERT OR REPLACE INTO ${table} (id,destination_id,data,created_at) VALUES (${q(itId)},${q(id)},${q({ ...it, id: itId })},${q(it.createdAt || nowISO())});`)
        bump(`dest.${sub}`)
      }
    }
  }
}

function importItineraries(rows) {
  let i = 0
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    const id = d.id
    const daysCount = Array.isArray(d.days) ? d.days.length : (num(d.days) || (num(d.nights) ? num(d.nights) + 1 : 0))
    const extra = omit(d, Object.keys(ITIN_SUBS)) // lossless catch-all minus subcollection arrays
    emit(`INSERT OR REPLACE INTO itineraries (id,quote_id,status,module,created_by,created_by_name,customer_name,customer_phone,customer_email,customer_id,destination,nights,days,adults,children,child_age,start_date,end_date,places_covered,notes,selected_plan_id,plans,margin,amount_paid,sales_name,handover_date,assigned_by_sales_id,assigned_by_sales_name,assigned_pre_ops_id,assigned_pre_ops_name,assigned_pre_ops_email,assigned_pre_ops_at,assigned_ops,assignment_mode,pre_ops_status,pre_ops_handover_acknowledged,pre_ops_handover_acknowledged_at,pre_ops_handover_acknowledged_by,post_ops_status,post_op_stage,sent_at,sent_by,sent_by_name,fin_tcs,extra,created_at,updated_at) VALUES (` +
      [
        q(id), q(d.quoteId || ""), q(d.status || "draft"), q(d.module || "custom"),
        q(d.createdBy || ""), q(d.createdByName || d.consultantName || d.salesName || ""), q(d.customerName || ""),
        q(d.customerPhone || ""), q(d.customerEmail || ""), q(d.customerId || ""), q(d.destination || ""),
        num(d.nights), daysCount, num(d.adults) || 1, num(d.children), q(d.childAge || ""),
        q(d.startDate || ""), q(d.endDate || ""), q(d.placesCovered || ""), q(d.notes || ""),
        q(d.selectedPlanId || ""), q(JSON.stringify(d.plans || [])), num(d.margin), num(d.amountPaid),
        q(d.salesName || d.consultantName || ""), q(d.handoverDate || ""), q(d.assignedBySalesId || ""), q(d.assignedBySalesName || ""),
        q(d.assignedPreOpsId || d.assignedOps || ""), q(d.assignedPreOpsName || ""), q(d.assignedPreOpsEmail || ""),
        q(d.assignedPreOpsAt || ""), q(d.assignedOps || ""), q(d.assignmentMode || ""), q(d.preOpsStatus || ""),
        bool(d.preOpsHandoverAcknowledged), q(d.preOpsHandoverAcknowledgedAt || ""), q(d.preOpsHandoverAcknowledgedBy || ""),
        q(d.postOpsStatus || ""), q(d.postOpStage || ""), q(d.sentAt || ""), q(d.sentBy || ""), q(d.sentByName || ""),
        num(d.finTcs), q(extra), q(d.createdAt || nowISO()), q(d.updatedAt || "")
      ].join(",") + `);`)
    bump("itineraries")

    for (const [sub, table] of Object.entries(ITIN_SUBS)) {
      const items = Array.isArray(d[sub]) ? d[sub] : []
      const tsCol = ITIN_SUBS_UPDATED_AT.has(table) ? "updated_at" : "created_at"
      let k = 0
      for (const it of items) {
        if (!it || typeof it !== "object") continue
        // Globally-unique row id: legacy Firestore sub-doc ids are only unique
        // within a parent, so key by parent + array position to avoid collisions.
        const itId = `${id}__${sub}_${k++}`
        const ts = it.updatedAt || it.createdAt || nowISO()
        emit(`INSERT OR REPLACE INTO ${table} (id,itinerary_id,data,${tsCol}) VALUES (${q(itId)},${q(id)},${q({ ...it, id: itId })},${q(ts)});`)
        bump(`itin.${sub}`)
      }
    }
    if (++i % 100 === 0) process.stdout.write(`    …itineraries ${i}/${rows.length}\n`)
  }
}

function importPackages(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    const id = d.id
    // packages keep their arrays INLINE in the data blob (that's how the app round-trips them)
    emit(`INSERT OR REPLACE INTO packages (id,name,destination,data,created_at,updated_at) VALUES (${q(id)},${q(d.packageName || d.name || "")},${q(d.destination || "")},${q(d)},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("packages")
    for (const [sub, table] of Object.entries(PKG_SUBS)) {
      const items = Array.isArray(d[sub]) ? d[sub] : []
      let k = 0
      for (const it of items) {
        if (!it || typeof it !== "object") continue
        const itId = `${id}__${sub}_${k++}`
        emit(`INSERT OR REPLACE INTO ${table} (id,package_id,data) VALUES (${q(itId)},${q(id)},${q({ ...it, id: itId })});`)
        bump(`pkg.${sub}`)
      }
    }
  }
}

function importCustomers(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    emit(`INSERT OR REPLACE INTO customers (id,name,phone,email,created_by,created_by_name,data,created_at,updated_at) VALUES (${q(d.id)},${q(d.name || "")},${q(d.phone || "")},${q(d.email || "")},${q(d.createdBy || "")},${q(d.createdByName || "")},${q(d)},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("customers")
  }
}

function importDrafts(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    emit(`INSERT OR REPLACE INTO drafts (id,user_id,data,created_at,updated_at) VALUES (${q(d.id)},${q(d.userId || "")},${q(d)},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("drafts")
  }
}

function importSOPs(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    emit(`INSERT OR REPLACE INTO sops (id,title,department,items,whatsapp_template,stage,categories,created_at,updated_at) VALUES (${q(d.id)},${q(d.title || "")},${q(d.department || "")},${q(JSON.stringify(d.items || []))},${q(d.whatsappTemplate || "")},${q(d.stage || "")},${q(JSON.stringify(d.categories || []))},${q(d.createdAt || nowISO())},${q(d.updatedAt || "")});`)
    bump("sops")
  }
}

function importSettings(rows) {
  for (const d of rows) {
    if (!d || typeof d !== "object" || !d.id) continue
    emit(`INSERT OR REPLACE INTO settings (id,data) VALUES (${q(d.id)},${q(d)});`)
    bump("settings")
  }
}

// ════════════════════════════════════════════════════════════════════════════
function main() {
  console.log(`\n🚀 JSON → D1 import  ${DRY_RUN ? "(DRY RUN — counting only)" : `(LIVE ${TARGET})`}`)
  console.log(`   source: ${SRC}\n`)
  if (!fs.existsSync(SRC)) { console.error(`❌ source file not found: ${SRC}`); process.exit(1) }

  const data = JSON.parse(fs.readFileSync(SRC, "utf8"))
  const get = (k) => (Array.isArray(data[k]) ? data[k] : [])

  const steps = [
    ["users", () => importUsers(get("users"))],
    ["destinations", () => importDestinations(get("destinations"))],
    ["sops", () => importSOPs(get("sops"))],
    ["settings", () => importSettings(get("settings"))],
    ["packages", () => importPackages(get("packages"))],
    ["customers", () => importCustomers(get("customers"))],
    ["drafts", () => importDrafts(get("drafts"))],
    ["itineraries", () => importItineraries(get("itineraries"))],
  ]
  try {
    for (const [label, fn] of steps) {
      console.log(`▶ ${label}…`)
      fn()
      flush()
    }
    console.log("\n\n✅ Import complete!\n")
    console.log("── Records imported ──────────────────")
    for (const [k, v] of Object.entries(stats).filter(([k]) => k !== "n").sort()) console.log(`   ${k.padEnd(28)} ${v}`)
    console.log("──────────────────────────────────────")
    if (DRY_RUN) console.log("\n(DRY RUN — nothing written. Re-run without --dry-run to import.)")
  } catch (err) {
    console.error("\n❌ Import aborted:", err.message)
    process.exitCode = 1
  } finally {
    if (!DRY_RUN && fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true })
  }
}

main()
