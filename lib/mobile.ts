// Sales Mobile App — server data layer (TMS is the source of truth).
// The Flutter app authenticates with an HRMS JWT (verified by getAgent) and every
// query here is scoped to the logged-in agent (owner_id) so a salesperson only ever
// sees their own leads/calls. Shapes are tailored to the app's models.

import { queryRows, queryOne } from "@/lib/db"

// Full identity for /api/mobile/me — Employee ID, name, designation, role, department,
// employee code, and the assigned sales number(s).
export async function getMe(db: D1Database, uid: string, resolvedRole?: string) {
  const u = await queryOne<any>(db,
    `SELECT uid, name, email, role, employee_code, department, designation, sales_number, phone
       FROM users WHERE uid = ?`, [uid])
  if (!u) return null
  const role = resolvedRole || u.role || "sales"   // HRMS token role is authoritative
  return {
    employeeId: u.uid,
    name: u.name || "",
    email: u.email || "",
    role,
    designation: u.designation || roleLabel(role),
    department: u.department || "",
    employeeCode: u.employeeCode || "",
    salesNumbers: (u.salesNumber || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    phone: u.phone || "",
  }
}

function roleLabel(role?: string): string {
  switch (role) {
    case "sales_lead": return "Team Lead"
    case "admin": case "owner": return "Sales Manager"
    case "sales": return "Salesperson"
    default: return role || ""
  }
}

// Map a TMS lead row → the mobile lead shape the app renders.
function shape(r: any) {
  return {
    id: r.id,
    name: r.contactName || r.contact_name || "",
    phone: r.phone || "",
    email: r.email || "",
    company: r.handle || "",                       // social handle / source identifier
    channel: r.source || "",
    destination: r.destination || "",
    tripType: r.tripType || r.trip_type || "",
    pax: r.pax || 1,
    budgetText: r.budgetText || r.budget_text || "",
    stage: (r.stage || "NEW"),                      // TMS CRM stage (source of truth)
    temperature: r.temperature || "cold",
    leadScore: r.score || 0,
    followUpAt: r.followUpAt || r.follow_up_at || null,
    lastSummary: null as string | null,            // filled by getLeadDetail
    lastCallAt: null as string | null,
    createdAt: r.capturedAt || r.captured_at || r.createdAt || r.created_at,
    updatedAt: r.updatedAt || r.updated_at,
  }
}

// The rep's own leads (flat list, newest activity first).
export async function listLeads(db: D1Database, ownerId: string) {
  const rows = await queryRows<any>(db,
    `SELECT id, source, contact_name, phone, email, handle, destination, travel_date,
            budget_text, trip_type, pax, score, temperature, stage, owner_id,
            follow_up_at, captured_at, last_activity_at, created_at, updated_at
       FROM leads WHERE owner_id = ? ORDER BY COALESCE(last_activity_at, updated_at) DESC`,
    [ownerId])
  return rows.map(shape)
}

// One lead the rep owns + its notes/last-call (returns null if not theirs → 404).
export async function getLeadDetail(db: D1Database, id: string, ownerId: string) {
  const r = await queryOne<any>(db, "SELECT * FROM leads WHERE id = ? AND owner_id = ?", [id, ownerId])
  if (!r) return null
  const lead = shape(r)
  const notes = await queryRows<any>(db,
    "SELECT detail, created_at FROM touch_events WHERE lead_id = ? AND type='note' ORDER BY created_at DESC LIMIT 1", [id])
  lead.lastSummary = notes[0]?.detail || null
  return lead
}
