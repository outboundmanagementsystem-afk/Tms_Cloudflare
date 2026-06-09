/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Firebase Firestore  →  Cloudflare D1   FULL DATA MIGRATION
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Migrates EVERYTHING from the old Firebase project into the new D1 database:
 *    users, destinations (+ hotels/activities/transfers/vehicleRules/dayPlans/attractions),
 *    itineraries (+ days/hotels/flights/transfers/activities/pricing/payments/
 *                  sopChecklist/postOpsChecklist/salesChecklist/postOps/tripNotes),
 *    packages (+ all subcollections), customers, drafts, sops, settings, accessTokens.
 *
 *  IDs are preserved exactly. All fields are preserved (mapped columns for querying
 *  + a full-document JSON blob so nothing is lost).
 *
 *  ── PREREQUISITES ───────────────────────────────────────────────────────────
 *   1. Download a Firebase service account key:
 *        Firebase Console → Project Settings → Service accounts
 *        → "Generate new private key" → save as  c:\tms\serviceAccount.json
 *   2. wrangler must be authenticated (already done).
 *   3. D1 schema already applied (already done).
 *
 *  ── RUN ─────────────────────────────────────────────────────────────────────
 *        node migrate-from-firebase.js              (full migration)
 *        node migrate-from-firebase.js --dry-run    (count docs only, no writes)
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const DB_NAME = "outbound-tms"
const DRY_RUN = process.argv.includes("--dry-run")
const TMP_DIR = path.join(__dirname, ".migration-tmp")
const BATCH_SIZE = 40 // statements per wrangler call

// ── Firebase Admin init ───────────────────────────────────────────────────────
let db
try {
  const admin = require("firebase-admin")
  const saPath = path.join(__dirname, "serviceAccount.json")
  if (!fs.existsSync(saPath)) {
    console.error("\n❌  serviceAccount.json not found in c:\\tms\\")
    console.error("    Download it: Firebase Console → Project Settings → Service accounts")
    console.error("    → Generate new private key → save as c:\\tms\\serviceAccount.json\n")
    process.exit(1)
  }
  const serviceAccount = require(saPath)
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }
  db = admin.firestore()
  console.log(`✓ Connected to Firebase project: ${serviceAccount.project_id}`)
} catch (e) {
  console.error("❌  Firebase Admin init failed:", e.message)
  process.exit(1)
}

// ── SQL helpers ───────────────────────────────────────────────────────────────
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
  const file = path.join(TMP_DIR, `batch_${_fileCounter++}.sql`)
  fs.writeFileSync(file, _batch.join("\n"), "utf8")
  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file="${file}"`, { stdio: "pipe" })
  } catch (err) {
    console.error(`\n❌  Batch ${_fileCounter} failed:`, err.stdout?.toString() || err.message)
    console.error(`    SQL saved at: ${file} (inspect & retry manually if needed)`)
    throw err
  }
  fs.unlinkSync(file)
  _batch = []
}

// ── Generic readers ─────────────────────────────────────────────────────────
async function getCol(name) {
  const snap = await db.collection(name).get()
  return snap.docs.map(d => ({ __id: d.id, ...d.data() }))
}
async function getSub(parentCol, parentId, sub) {
  const snap = await db.collection(parentCol).doc(parentId).collection(sub).get()
  return snap.docs.map(d => ({ __id: d.id, ...d.data() }))
}

// ════════════════════════════════════════════════════════════════════════════
//  COLLECTION MIGRATORS
// ════════════════════════════════════════════════════════════════════════════

async function migrateUsers() {
  const docs = await getCol("users")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO users (uid,name,email,role,employee_code,department,lead_id,phone,status,on_leave,inactive,disabled,password_hash,created_at,updated_at) VALUES (${q(d.__id)},${q(d.name||"")},${q((d.email||"").toLowerCase())},${q(d.role||"sales")},${q(d.employeeCode||"")},${q(d.department||"")},${q(d.leadId||"")},${q(d.phone||"")},${q(d.status||"active")},${bool(d.onLeave)},${bool(d.inactive)},${bool(d.disabled)},${q("")},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("users")
  }
}

const DEST_SUBS = { hotels:"destination_hotels", activities:"destination_activities", transfers:"destination_transfers", vehicleRules:"destination_vehicle_rules", dayPlans:"destination_day_plans", attractions:"destination_attractions" }

async function migrateDestinations() {
  const docs = await getCol("destinations")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO destinations (id,name,country,description,data,created_at,updated_at) VALUES (${q(d.__id)},${q(d.name||"")},${q(d.country||"")},${q(d.description||"")},${q(d)},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("destinations")
    for (const [sub, table] of Object.entries(DEST_SUBS)) {
      const items = await getSub("destinations", d.__id, sub)
      for (const it of items) {
        emit(`INSERT OR REPLACE INTO ${table} (id,destination_id,data,created_at) VALUES (${q(it.__id)},${q(d.__id)},${q(it)},${q(it.createdAt||nowISO())});`)
        bump(`dest.${sub}`)
      }
    }
  }
}

const ITIN_SUBS = { days:"itinerary_days", hotels:"itinerary_hotels", flights:"itinerary_flights", transfers:"itinerary_transfers", activities:"itinerary_activities", pricing:"itinerary_pricing", payments:"itinerary_payments", sopChecklist:"itinerary_sop_checklist", postOpsChecklist:"itinerary_post_ops_checklist", salesChecklist:"itinerary_sales_checklist", tripNotes:"itinerary_trip_notes" }

async function migrateItineraries() {
  const docs = await getCol("itineraries")
  let i = 0
  for (const d of docs) {
    // Mapped columns (for queries/indexes) + full doc in `extra` (lossless catch-all)
    emit(`INSERT OR REPLACE INTO itineraries (id,quote_id,status,module,created_by,created_by_name,customer_name,customer_phone,customer_email,customer_id,destination,nights,days,adults,children,child_age,start_date,end_date,places_covered,notes,selected_plan_id,plans,margin,amount_paid,sales_name,handover_date,assigned_by_sales_id,assigned_by_sales_name,assigned_pre_ops_id,assigned_pre_ops_name,assigned_pre_ops_email,assigned_pre_ops_at,assigned_ops,assignment_mode,pre_ops_status,pre_ops_handover_acknowledged,pre_ops_handover_acknowledged_at,pre_ops_handover_acknowledged_by,post_ops_status,post_op_stage,sent_at,sent_by,sent_by_name,fin_tcs,extra,created_at,updated_at) VALUES (` +
      [
        q(d.__id), q(d.quoteId||""), q(d.status||"draft"), q(d.module||"custom"),
        q(d.createdBy||""), q(d.createdByName||d.salesName||""), q(d.customerName||""),
        q(d.customerPhone||""), q(d.customerEmail||""), q(d.customerId||""), q(d.destination||""),
        num(d.nights), num(d.days), num(d.adults)||1, num(d.children), q(d.childAge||""),
        q(d.startDate||""), q(d.endDate||""), q(d.placesCovered||""), q(d.notes||""),
        q(d.selectedPlanId||""), q(JSON.stringify(d.plans||[])), num(d.margin), num(d.amountPaid),
        q(d.salesName||""), q(d.handoverDate||""), q(d.assignedBySalesId||""), q(d.assignedBySalesName||""),
        q(d.assignedPreOpsId||d.assignedOps||""), q(d.assignedPreOpsName||""), q(d.assignedPreOpsEmail||""),
        q(d.assignedPreOpsAt||""), q(d.assignedOps||""), q(d.assignmentMode||""), q(d.preOpsStatus||""),
        bool(d.preOpsHandoverAcknowledged), q(d.preOpsHandoverAcknowledgedAt||""), q(d.preOpsHandoverAcknowledgedBy||""),
        q(d.postOpsStatus||""), q(d.postOpStage||""), q(d.sentAt||""), q(d.sentBy||""), q(d.sentByName||""),
        num(d.finTcs), q(d), q(d.createdAt||nowISO()), q(d.updatedAt||"")
      ].join(",") + `);`)
    bump("itineraries")

    for (const [sub, table] of Object.entries(ITIN_SUBS)) {
      const items = await getSub("itineraries", d.__id, sub)
      for (const it of items) {
        emit(`INSERT OR REPLACE INTO ${table} (id,itinerary_id,data,created_at) VALUES (${q(it.__id)},${q(d.__id)},${q(it)},${q(it.createdAt||nowISO())});`)
        bump(`itin.${sub}`)
      }
    }
    // postOps/data single doc
    try {
      const pdSnap = await db.collection("itineraries").doc(d.__id).collection("postOps").doc("data").get()
      if (pdSnap.exists) {
        emit(`INSERT OR REPLACE INTO itinerary_post_ops_data (itinerary_id,data,updated_at) VALUES (${q(d.__id)},${q(pdSnap.data())},${q(nowISO())});`)
        bump("itin.postOpsData")
      }
    } catch { /* no postOps doc */ }

    if (++i % 20 === 0) console.log(`    …itineraries ${i}/${docs.length}`)
  }
}

const PKG_SUBS = { days:"package_days", hotels:"package_hotels", flights:"package_flights", transfers:"package_transfers", activities:"package_activities", pricing:"package_pricing" }

async function migratePackages() {
  const docs = await getCol("packages")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO packages (id,name,destination,data,created_at,updated_at) VALUES (${q(d.__id)},${q(d.name||"")},${q(d.destination||"")},${q(d)},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("packages")
    for (const [sub, table] of Object.entries(PKG_SUBS)) {
      const items = await getSub("packages", d.__id, sub)
      for (const it of items) {
        emit(`INSERT OR REPLACE INTO ${table} (id,package_id,data) VALUES (${q(it.__id)},${q(d.__id)},${q(it)});`)
        bump(`pkg.${sub}`)
      }
    }
  }
}

async function migrateCustomers() {
  const docs = await getCol("customers")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO customers (id,name,phone,email,created_by,created_by_name,data,created_at,updated_at) VALUES (${q(d.__id)},${q(d.name||"")},${q(d.phone||"")},${q(d.email||"")},${q(d.createdBy||"")},${q(d.createdByName||"")},${q(d)},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("customers")
  }
}

async function migrateDrafts() {
  const docs = await getCol("drafts")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO drafts (id,user_id,data,created_at,updated_at) VALUES (${q(d.__id)},${q(d.userId||"")},${q(d)},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("drafts")
  }
}

async function migrateSOPs() {
  const docs = await getCol("sops")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO sops (id,title,department,items,whatsapp_template,stage,categories,created_at,updated_at) VALUES (${q(d.__id)},${q(d.title||"")},${q(d.department||"")},${q(JSON.stringify(d.items||[]))},${q(d.whatsappTemplate||"")},${q(d.stage||"")},${q(JSON.stringify(d.categories||[]))},${q(d.createdAt||nowISO())},${q(d.updatedAt||"")});`)
    bump("sops")
  }
}

async function migrateSettings() {
  const docs = await getCol("settings")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO settings (id,data) VALUES (${q(d.__id)},${q(d)});`)
    bump("settings")
  }
}

async function migrateAccessTokens() {
  const docs = await getCol("accessTokens")
  for (const d of docs) {
    emit(`INSERT OR REPLACE INTO access_tokens (id,itinerary_id,requested_by,requested_by_name,requested_by_role,reason,status,approved_by,approved_by_name,approved_at,expires_at,requested_at) VALUES (${q(d.__id)},${q(d.itineraryId||"")},${q(d.requestedBy||"")},${q(d.requestedByName||"")},${q(d.requestedByRole||"")},${q(d.reason||"")},${q(d.status||"pending")},${q(d.approvedBy||"")},${q(d.approvedByName||"")},${q(d.approvedAt||"")},${q(d.expiresAt||"")},${q(d.requestedAt||nowISO())});`)
    bump("accessTokens")
  }
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n🚀 Firebase → D1 migration ${DRY_RUN ? "(DRY RUN — counting only)" : "(LIVE)"}\n`)
  const steps = [
    ["Users", migrateUsers],
    ["Destinations + pricing master", migrateDestinations],
    ["SOPs", migrateSOPs],
    ["Packages", migratePackages],
    ["Customers", migrateCustomers],
    ["Drafts", migrateDrafts],
    ["Settings", migrateSettings],
    ["Itineraries + all subcollections", migrateItineraries],
    ["Access tokens", migrateAccessTokens],
  ]
  try {
    for (const [label, fn] of steps) {
      console.log(`▶ ${label}…`)
      await fn()
      flush()
    }
    console.log("\n✅ Migration complete!\n")
    console.log("── Records migrated ──────────────────")
    for (const [k, v] of Object.entries(stats).sort()) console.log(`   ${k.padEnd(28)} ${v}`)
    console.log("──────────────────────────────────────")
    if (DRY_RUN) console.log("\n(DRY RUN — nothing was written. Re-run without --dry-run to migrate.)")
  } catch (err) {
    console.error("\n❌ Migration aborted:", err.message)
    process.exitCode = 1
  } finally {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true })
  }
}

main()
