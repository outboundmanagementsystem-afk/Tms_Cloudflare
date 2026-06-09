import { getDB, queryRows, execute, newId, now } from "@/lib/db"

// Maps a department to its checklist table.
const DEPT_TABLE: Record<string, string> = {
  sales:    "itinerary_sales_checklist",
  pre_ops:  "itinerary_sop_checklist",
  post_ops: "itinerary_post_ops_checklist",
}

// sops.items / sops.categories arrive already JSON-parsed by expandData() (lib/db.ts),
// but may still be a raw string if read another way — handle both.
function asArr(v: any): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === "string") { try { return JSON.parse(v || "[]") } catch { return [] } }
  return []
}

// Build a checklist from the SOP templates for `department` if it has none yet.
// Mirrors the logic in app/api/itineraries/[id]/status/route.ts so checklists can
// also be initialised on demand (e.g. the Sales pre-handover checklist, which must
// populate as soon as a rep opens the booking — before any status transition).
async function initChecklist(db: D1Database, itinId: string, department: string, table: string) {
  const sops = await queryRows(db, `SELECT * FROM sops WHERE department = ?`, [department])
  if (!sops.length) return 0

  const inserts: Promise<any>[] = []
  for (const sop of sops) {
    const items = asArr((sop as any).items)
    const categories = asArr((sop as any).categories)

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = newId()
      const data = {
        ...item,
        id,
        // Stable identity for re-sync dedup (server) and display dedup (client),
        // since `id` is replaced with a fresh uuid and items use `title` not `name`.
        originalId: item.originalId || item.id,
        checked: false,
        acknowledged: false,
        fileUrl: "",
        response: "",
        notes: item.notes || "",
        sopId: (sop as any).id,
        sopTitle: (sop as any).title,
        order: item.order ?? i,
        ...(department === "sales" && categories.length > 0 ? (() => {
          // SOP items reference their category by id, held in item.category (or item.categoryId).
          // The modal groups by the category NAME, so resolve id → name here.
          const catRef = item.categoryId ?? item.category
          const idx = categories.findIndex((c: any) => c.id === catRef)
          return { category: idx >= 0 ? categories[idx].name : "", categoryOrder: idx >= 0 ? idx : 9999 }
        })() : {}),
      }
      inserts.push(execute(db,
        `INSERT OR IGNORE INTO ${table} (id, itinerary_id, data, updated_at) VALUES (?,?,?,?)`,
        [id, itinId, JSON.stringify(data), now()]
      ))
    }
  }
  await Promise.all(inserts)
  return inserts.length
}

// Add any SOP items that aren't already present (without disturbing existing answers).
async function syncChecklist(db: D1Database, itinId: string, department: string, table: string) {
  // queryRows() runs expandData(), which parses the JSON `data` column and spreads its
  // fields onto the row (removing `data` itself) — so read keys from the row directly.
  const existing = await queryRows(db, `SELECT * FROM ${table} WHERE itinerary_id = ?`, [itinId])
  if (!existing.length) return initChecklist(db, itinId, department, table)

  // Dedup by BOTH id and normalised name/title. Matching on name as well makes this
  // robust to SOP-item id churn (edited templates), so an item that already exists is
  // never re-added under a new id.
  const norm = (o: any) => String(o?.name || o?.title || "").trim().toLowerCase().replace(/\s+/g, " ")
  const existingKeys = new Set<string>()
  for (const r of existing as any[]) {
    if (r.originalId) existingKeys.add("id:" + r.originalId)
    if (r.sopItemId) existingKeys.add("id:" + r.sopItemId)
    const n = norm(r); if (n) existingKeys.add("name:" + n)
  }

  const sops = await queryRows(db, `SELECT * FROM sops WHERE department = ?`, [department])
  const inserts: Promise<any>[] = []
  for (const sop of sops) {
    const items = asArr((sop as any).items)
    const categories = asArr((sop as any).categories)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const idKey = item.originalId || item.id || item.sopItemId
      const nameKey = norm(item)
      if ((idKey && existingKeys.has("id:" + idKey)) || (nameKey && existingKeys.has("name:" + nameKey))) continue
      const id = newId()
      const data = {
        ...item, id, originalId: item.originalId || item.id, checked: false, acknowledged: false, fileUrl: "", response: "",
        notes: item.notes || "", sopId: (sop as any).id, sopTitle: (sop as any).title, order: item.order ?? i,
        ...(department === "sales" && categories.length > 0 ? (() => {
          // SOP items reference their category by id, held in item.category (or item.categoryId).
          // The modal groups by the category NAME, so resolve id → name here.
          const catRef = item.categoryId ?? item.category
          const idx = categories.findIndex((c: any) => c.id === catRef)
          return { category: idx >= 0 ? categories[idx].name : "", categoryOrder: idx >= 0 ? idx : 9999 }
        })() : {}),
      }
      inserts.push(execute(db,
        `INSERT OR IGNORE INTO ${table} (id, itinerary_id, data, updated_at) VALUES (?,?,?,?)`,
        [id, itinId, JSON.stringify(data), now()]
      ))
    }
  }
  await Promise.all(inserts)
  return inserts.length
}

export async function POST(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params
  try {
    const body = await req.json().catch(() => ({}))
    const department = String(body.department || "").trim()
    const table = DEPT_TABLE[department]
    if (!table) return Response.json({ error: `Unknown department: ${department}` }, { status: 400 })

    const db = await getDB()
    const added = await syncChecklist(db, params.id, department, table)
    return Response.json({ ok: true, added })
  } catch (err: any) {
    console.error("sync-checklist error:", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
