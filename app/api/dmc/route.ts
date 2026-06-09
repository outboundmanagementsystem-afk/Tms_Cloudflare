import { getDB } from "@/lib/db"

// DMC details live in each booking's Sales checklist (DMC Name / Contact / Quote / Cost).
// This route extracts them per booking and scopes the result set by the caller's role:
//   admin/owner          → all bookings
//   sales                → bookings they created
//   sales_lead           → their team's bookings
//   pre_ops / ops        → bookings assigned to them
//   pre_ops_lead/ops_lead→ their team's assigned bookings
//   post_ops(/_lead)     → bookings in post-ops / completed (team-shared)

function dmcSub(alias: string, namePattern: string, withFile = false) {
  const pick = withFile
    ? `COALESCE(NULLIF(json_extract(s.data,'$.fileUrl'),''), json_extract(s.data,'$.response'))`
    : `json_extract(s.data,'$.response')`
  return `(SELECT ${pick} FROM itinerary_sales_checklist s
            WHERE s.itinerary_id = i.id
              AND lower(json_extract(s.data,'$.name')) LIKE '${namePattern}'
            ORDER BY (CASE WHEN COALESCE(json_extract(s.data,'$.response'),'')<>'' OR COALESCE(json_extract(s.data,'$.fileUrl'),'')<>'' THEN 0 ELSE 1 END)
            LIMIT 1) AS ${alias}`
}

async function teamUids(db: D1Database, leadUid: string): Promise<string[]> {
  const { results } = await db.prepare("SELECT uid FROM users WHERE lead_id = ?").bind(leadUid).all()
  return [leadUid, ...((results as any[]) || []).map(r => r.uid)].filter(Boolean)
}

export async function GET(req: Request) {
  try {
    const db = await getDB()
    const { searchParams } = new URL(req.url)
    const role = (searchParams.get("role") || "").trim()
    const uid = (searchParams.get("uid") || "").trim()

    let where = "1=1"
    const params: any[] = []

    if (role === "admin" || role === "owner") {
      where = "1=1"
    } else if (role === "sales") {
      where = "i.created_by = ?"; params.push(uid)
    } else if (role === "sales_lead") {
      const team = await teamUids(db, uid)
      where = `i.created_by IN (${team.map(() => "?").join(",")})`; params.push(...team)
    } else if (role === "pre_ops" || role === "ops") {
      where = "(i.assigned_pre_ops_id = ? OR i.assigned_ops = ?)"; params.push(uid, uid)
    } else if (role === "pre_ops_lead" || role === "ops_lead") {
      const team = await teamUids(db, uid)
      const ph = team.map(() => "?").join(",")
      where = `(i.assigned_pre_ops_id IN (${ph}) OR i.assigned_ops IN (${ph}))`; params.push(...team, ...team)
    } else if (role === "post_ops" || role === "post_ops_lead") {
      where = "i.status IN ('post-ops','completed')"
    } else {
      where = "i.created_by = ?"; params.push(uid)
    }

    const sql = `
      SELECT i.id, i.customer_name, i.destination, i.status, i.created_by, i.created_by_name,
             i.sales_name, i.assigned_pre_ops_id, i.assigned_pre_ops_name, i.start_date, i.end_date, i.updated_at,
             ${dmcSub("dmc_name", "dmc name%")},
             ${dmcSub("dmc_contact", "dmc contact%")},
             ${dmcSub("dmc_quote", "dmc quote%", true)},
             ${dmcSub("dmc_amount", "dmc cost%")}
      FROM itineraries i
      WHERE ${where}
      ORDER BY i.updated_at DESC
    `
    const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
    const { results } = await stmt.all()

    const records = ((results as any[]) || [])
      .filter(r => (r.dmc_name && String(r.dmc_name).trim()) || (r.dmc_contact && String(r.dmc_contact).trim()) || (r.dmc_quote && String(r.dmc_quote).trim()) || (r.dmc_amount && String(r.dmc_amount).trim()))
      .map(r => ({
        itineraryId: r.id,
        customerName: r.customer_name || "",
        destination: r.destination || "",
        status: r.status || "",
        salesUid: r.created_by || "",
        salesName: r.created_by_name || r.sales_name || "",
        preOpsId: r.assigned_pre_ops_id || "",
        preOpsName: r.assigned_pre_ops_name || "",
        startDate: r.start_date || "",
        endDate: r.end_date || "",
        dmcName: (r.dmc_name || "").toString().trim(),
        dmcContact: (r.dmc_contact || "").toString().trim(),
        dmcQuote: (r.dmc_quote || "").toString().trim(),
        dmcAmount: (r.dmc_amount || "").toString().trim(),
        updatedAt: r.updated_at || "",
      }))

    return Response.json(records)
  } catch (err: any) {
    console.error("DMC route error:", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
