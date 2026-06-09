import { getDB, queryOne, execute, now } from "@/lib/db"
import { getAuthUser, isAdmin } from "@/lib/auth-server"

// Real itinerary columns (camelCase). Anything else in a PUT body is folded into the
// `extra` JSON blob rather than emitted as a bad column — keeping the hybrid storage
// robust. Without this, updating a field that has no column (e.g. postOpsStatusUpdatedAt
// from the post-ops pipeline, or finance's fin* fields) made the whole UPDATE fail.
const ITIN_COLS = new Set([
  "quoteId", "status", "module", "createdBy", "createdByName",
  "customerName", "customerPhone", "customerEmail", "customerId", "destination",
  "nights", "days", "adults", "children", "childAge", "startDate", "endDate",
  "placesCovered", "notes", "selectedPlanId", "margin", "amountPaid", "salesName",
  "handoverDate", "assignedBySalesId", "assignedBySalesName", "assignedPreOpsId",
  "assignedPreOpsName", "assignedPreOpsEmail", "assignedPreOpsAt", "assignedOps",
  "assignmentMode", "preOpsStatus", "preOpsHandoverAcknowledged",
  "preOpsHandoverAcknowledgedAt", "preOpsHandoverAcknowledgedBy", "postOpsStatus",
  "postOpStage", "sentAt", "sentBy", "sentByName", "finTcs", "updatedAt",
])

const snake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const row = await queryOne(db, "SELECT * FROM itineraries WHERE id = ?", [params.id])
  if (!row) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(row)
}

export async function PUT(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const db = await getDB()
  const body = await req.json()

  const setClauses: string[] = []
  const values: any[] = []
  const extraPatch: Record<string, any> = {}

  for (const [k, v] of Object.entries(body)) {
    if (k === "id" || k === "createdAt") continue
    if (k === "plans") { setClauses.push("plans = ?"); values.push(JSON.stringify(v)); continue }
    if (k === "extra") { if (v && typeof v === "object") Object.assign(extraPatch, v); continue }
    if (ITIN_COLS.has(k)) {
      setClauses.push(`${snake(k)} = ?`)
      values.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v)
    } else {
      extraPatch[k] = v   // no column for this field → keep it in the extra blob
    }
  }

  // Always bump updated_at
  if (!body.updatedAt) { setClauses.push("updated_at = ?"); values.push(now()) }

  // Merge any non-column fields into the existing extra JSON (atomic, no read needed).
  if (Object.keys(extraPatch).length) {
    setClauses.push("extra = json_patch(COALESCE(extra,'{}'), ?)")
    values.push(JSON.stringify(extraPatch))
  }

  if (!setClauses.length) return Response.json({ ok: true })
  await execute(db, `UPDATE itineraries SET ${setClauses.join(",")} WHERE id = ?`, [...values, params.id])
  return Response.json({ ok: true })
}

export async function DELETE(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const user = await getAuthUser(req)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const db = await getDB()
  const row: any = await queryOne(db, "SELECT created_by FROM itineraries WHERE id = ?", [params.id])
  if (!row) return Response.json({ ok: true })
  // Only the creator or an admin/owner may delete a booking.
  if (!isAdmin(user) && row.createdBy !== user.uid) {
    return Response.json({ error: "Forbidden — not your booking" }, { status: 403 })
  }
  await execute(db, "DELETE FROM itineraries WHERE id = ?", [params.id])
  return Response.json({ ok: true })
}
