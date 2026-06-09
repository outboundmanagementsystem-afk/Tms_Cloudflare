import { getDB, queryRows, execute, newId, now } from "@/lib/db"

// Maps URL subcollection name → D1 table name
const TABLE: Record<string, string> = {
  days:                "itinerary_days",
  hotels:              "itinerary_hotels",
  flights:             "itinerary_flights",
  transfers:           "itinerary_transfers",
  activities:          "itinerary_activities",
  pricing:             "itinerary_pricing",
  payments:            "itinerary_payments",
  sopChecklist:        "itinerary_sop_checklist",
  postOpsChecklist:    "itinerary_post_ops_checklist",
  salesChecklist:      "itinerary_sales_checklist",
  postOpsData:         "itinerary_post_ops_data",
  tripNotes:           "itinerary_trip_notes",
}

export async function GET(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const rows = await queryRows(db, `SELECT * FROM ${table} WHERE itinerary_id = ?`, [params.id])
  return Response.json(rows)
}

export async function POST(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  const body = await req.json()
  const id = body.id || newId()

  if (table === "itinerary_post_ops_data") {
    // Upsert single doc keyed by itinerary_id
    await execute(db,
      `INSERT INTO itinerary_post_ops_data (itinerary_id, data, updated_at) VALUES (?,?,?)
       ON CONFLICT(itinerary_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
      [params.id, JSON.stringify(body), now()]
    )
    return Response.json({ id: params.id })
  }

  if (table === "itinerary_payments") {
    // Insert the payment AND recompute the booking's amount_paid in one atomic batch,
    // so two concurrent payments can't lose each other's total (race fix). The sum is
    // taken from the JSON `data.amount` so it's correct for migrated rows too.
    const amount = Number(body.amount) || 0
    await db.batch([
      db.prepare(`INSERT INTO itinerary_payments (id, itinerary_id, amount, type, method, ref_number, collected_by, collected_by_name, screenshot_url, notes, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, params.id, amount, body.type || "", body.method || "", body.refNumber || "", body.collectedBy || "", body.collectedByName || "", body.screenshotUrl || "", body.notes || "", JSON.stringify({ ...body, id }), now()),
      db.prepare(`UPDATE itineraries SET amount_paid = (SELECT COALESCE(SUM(CAST(json_extract(data,'$.amount') AS REAL)),0) FROM itinerary_payments WHERE itinerary_id = ?), updated_at = ? WHERE id = ?`)
        .bind(params.id, now(), params.id),
    ])
    return Response.json({ id })
  }

  await execute(db,
    `INSERT INTO ${table} (id, itinerary_id, data, created_at) VALUES (?,?,?,?)`,
    [id, params.id, JSON.stringify({ ...body, id }), now()]
  )
  return Response.json({ id })
}

export async function DELETE(_: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  const table = TABLE[params.subcollection]
  if (!table) return Response.json({ error: "Unknown subcollection" }, { status: 400 })
  const db = await getDB()
  await execute(db, `DELETE FROM ${table} WHERE itinerary_id = ?`, [params.id])
  return Response.json({ ok: true })
}
