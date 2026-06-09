import { getDB, queryRows, execute, newId, now } from "@/lib/db"

export async function GET(req: Request) {
  const db = await getDB()
  const { searchParams } = new URL(req.url)
  const createdBy = searchParams.get("createdBy")
  const status = searchParams.get("status")
  const assignedPreOpsId = searchParams.get("assignedPreOpsId")
  const quoteId = searchParams.get("quoteId")
  const customerId = searchParams.get("customerId")

  let sql = "SELECT * FROM itineraries WHERE 1=1"
  const params: any[] = []
  if (createdBy) { sql += " AND created_by = ?"; params.push(createdBy) }
  if (status) { sql += " AND status = ?"; params.push(status) }
  if (assignedPreOpsId) { sql += " AND assigned_pre_ops_id = ?"; params.push(assignedPreOpsId) }
  if (quoteId) { sql += " AND quote_id = ?"; params.push(quoteId) }
  if (customerId) { sql += " AND customer_id = ?"; params.push(customerId) }
  sql += " ORDER BY created_at DESC"

  const rows = await queryRows(db, sql, params)
  return Response.json(rows)
}

export async function POST(req: Request) {
  const db = await getDB()
  const body = await req.json()
  const id = body.id || newId()
  const createdAt = now()
  await execute(db,
    `INSERT INTO itineraries
      (id,quote_id,status,module,created_by,created_by_name,customer_name,customer_phone,
       customer_email,customer_id,destination,nights,days,adults,children,child_age,
       start_date,end_date,places_covered,notes,selected_plan_id,plans,margin,amount_paid,
       sales_name,extra,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, body.quoteId||"", body.status||"draft", body.module||"custom",
     body.createdBy||"", body.createdByName||"", body.customerName||"",
     body.customerPhone||"", body.customerEmail||"", body.customerId||"",
     body.destination||"", body.nights||0, body.days||0, body.adults||1,
     body.children||0, body.childAge||"", body.startDate||"", body.endDate||"",
     body.placesCovered||"", body.notes||"", body.selectedPlanId||"",
     JSON.stringify(body.plans||[]), body.margin||0, body.amountPaid||0,
     body.salesName||"", JSON.stringify(body.extra||{}), createdAt, createdAt]
  )
  return Response.json({ id })
}
