import { getDB, queryRows, queryOne, execute, newId, now } from "@/lib/db"

// sops.items / sops.categories arrive already JSON-parsed by expandData() (lib/db.ts),
// but may still be a raw string if read another way — handle both.
function asArr(v: any): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === "string") { try { return JSON.parse(v || "[]") } catch { return [] } }
  return []
}

// ── Auto-assign Pre-Ops ───────────────────────────────────────────────────────
async function autoAssignPreOps(db: D1Database, itinId: string, extraData: Record<string, any>) {
  const AVAIL = `(status IS NULL OR status = 'active')
     AND (on_leave = 0 OR on_leave IS NULL)
     AND (inactive = 0 OR inactive IS NULL)
     AND (disabled = 0 OR disabled IS NULL)`
  // Round-robin among the actual pre-ops handlers first. Only fall back to including
  // leads if there are no plain pre_ops users — so a team with one pre_ops employee
  // gets every handover, instead of leads being pulled into the rotation.
  let team = await queryRows(db, `SELECT uid, name, email FROM users WHERE role = 'pre_ops' AND ${AVAIL}`)
  if (!team.length) team = await queryRows(db, `SELECT uid, name, email FROM users WHERE role IN ('pre_ops','pre_ops_lead') AND ${AVAIL}`)
  if (!team.length) return {}

  // Count active itineraries per person
  const counts = await Promise.all(team.map(async (emp: any) => {
    const row = await queryOne(db,
      `SELECT COUNT(*) as cnt FROM itineraries
       WHERE assigned_pre_ops_id = ? AND status IN ('handover','pre-ops')`,
      [emp.uid]
    )
    return { ...emp, load: (row as any)?.cnt || 0 }
  }))

  // Pick least loaded; tiebreak by earliest assignment (round-robin approximation)
  counts.sort((a: any, b: any) => a.load - b.load)
  const chosen = counts[0] as any

  return {
    assignedPreOpsId: chosen.uid,
    assignedPreOpsName: chosen.name || "",
    assignedPreOpsEmail: chosen.email || "",
    assignedPreOpsAt: now(),
    assignedBySalesId: extraData.assignedBySalesId || "",
    assignedBySalesName: extraData.assignedBySalesName || "",
    assignmentMode: "round_robin",
    preOpsStatus: "assigned",
    assignedOps: chosen.uid,
  }
}

// ── Checklist initialisation from SOPs ───────────────────────────────────────
async function initChecklist(
  db: D1Database,
  itinId: string,
  department: "pre_ops" | "post_ops" | "sales",
  table: string
) {
  // Check if checklist already has items
  const existing = await queryRows(db, `SELECT id FROM ${table} WHERE itinerary_id = ?`, [itinId])
  if (existing.length > 0) return  // already initialised — sync only new items

  const sops = await queryRows(db, `SELECT * FROM sops WHERE department = ?`, [department])
  if (!sops.length) return

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
}

async function syncChecklist(
  db: D1Database,
  itinId: string,
  department: "pre_ops" | "post_ops" | "sales",
  table: string
) {
  // queryRows() expands the JSON `data` column onto the row (removing `data`), so read
  // dedup keys from the row fields directly rather than re-parsing `data`.
  const existing = await queryRows(db, `SELECT * FROM ${table} WHERE itinerary_id = ?`, [itinId])
  if (!existing.length) {
    return initChecklist(db, itinId, department, table)
  }
  // Dedup by id AND normalised name/title (robust to SOP-item id churn).
  const norm = (o: any) => String(o?.name || o?.title || "").trim().toLowerCase().replace(/\s+/g, " ")
  const existingIds = new Set<string>()
  for (const r of existing as any[]) {
    if (r.originalId) existingIds.add("id:" + r.originalId)
    if (r.sopItemId) existingIds.add("id:" + r.sopItemId)
    const n = norm(r); if (n) existingIds.add("name:" + n)
  }

  const sops = await queryRows(db, `SELECT * FROM sops WHERE department = ?`, [department])
  const inserts: Promise<any>[] = []
  for (const sop of sops) {
    const items = asArr((sop as any).items)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const idKey = item.originalId || item.id || item.sopItemId
      const nameKey = norm(item)
      if ((idKey && existingIds.has("id:" + idKey)) || (nameKey && existingIds.has("name:" + nameKey))) continue
      const id = newId()
      inserts.push(execute(db,
        `INSERT OR IGNORE INTO ${table} (id, itinerary_id, data, updated_at) VALUES (?,?,?,?)`,
        [id, itinId, JSON.stringify({ ...item, id, originalId: item.originalId || item.id, checked: false, sopId: (sop as any).id, order: i }), now()]
      ))
    }
  }
  await Promise.all(inserts)
}

// ── Status transition endpoint ────────────────────────────────────────────────
export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  try {
    const db = await getDB()
    const body = await req.json()
    const { status, ...extraData } = body

    if (!status) return Response.json({ error: "status required" }, { status: 400 })

    const itin = await queryOne(db, "SELECT * FROM itineraries WHERE id = ?", [params.id])
    if (!itin) return Response.json({ error: "Not found" }, { status: 404 })

    let assignmentData: Record<string, any> = {}

    // Auto-assign Pre-Ops on handover
    if (status === "handover") {
      assignmentData = await autoAssignPreOps(db, params.id, extraData)
    }

    // Update the itinerary status
    const allExtra = { ...extraData, ...assignmentData }
    const setClauses = ["status = ?", "updated_at = ?"]
    const vals: any[] = [status, now()]

    const colMap: Record<string, string> = {
      assignedPreOpsId: "assigned_pre_ops_id", assignedPreOpsName: "assigned_pre_ops_name",
      assignedPreOpsEmail: "assigned_pre_ops_email", assignedPreOpsAt: "assigned_pre_ops_at",
      assignedBySalesId: "assigned_by_sales_id", assignedBySalesName: "assigned_by_sales_name",
      assignmentMode: "assignment_mode", preOpsStatus: "pre_ops_status", assignedOps: "assigned_ops",
      handoverDate: "handover_date", salesName: "sales_name", sentAt: "sent_at",
      sentBy: "sent_by", sentByName: "sent_by_name", postOpStage: "post_op_stage",
    }
    for (const [k, v] of Object.entries(allExtra)) {
      const col = colMap[k]
      if (col) { setClauses.push(`${col} = ?`); vals.push(v) }
    }
    vals.push(params.id)

    await execute(db, `UPDATE itineraries SET ${setClauses.join(",")} WHERE id = ?`, vals)

    // Checklist side-effects
    if (status === "handover" || status === "pre-ops") {
      const cl = await queryRows(db, "SELECT id FROM itinerary_sop_checklist WHERE itinerary_id = ?", [params.id])
      if (cl.length === 0) {
        await initChecklist(db, params.id, "pre_ops", "itinerary_sop_checklist")
      } else {
        await syncChecklist(db, params.id, "pre_ops", "itinerary_sop_checklist")
      }
      // Init sales checklist too if not present
      const sl = await queryRows(db, "SELECT id FROM itinerary_sales_checklist WHERE itinerary_id = ?", [params.id])
      if (sl.length === 0) {
        await initChecklist(db, params.id, "sales", "itinerary_sales_checklist")
      }
    }

    if (status === "post-ops") {
      const cl = await queryRows(db, "SELECT id FROM itinerary_post_ops_checklist WHERE itinerary_id = ?", [params.id])
      if (cl.length === 0) {
        await initChecklist(db, params.id, "post_ops", "itinerary_post_ops_checklist")
      } else {
        await syncChecklist(db, params.id, "post_ops", "itinerary_post_ops_checklist")
      }
    }

    return Response.json({ ok: true, ...assignmentData })
  } catch (err: any) {
    console.error("Status update error:", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
