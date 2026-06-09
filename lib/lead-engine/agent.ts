// Resolve the current agent for lead-engine API routes. Heals the uid by email
// against outbound-tms.users (same approach as /api/auth/session) so leads.owner_id
// always matches the TMS user record.

import { getAuthUser } from "@/lib/auth-server"
import { getDB, queryOne } from "@/lib/db"

export interface Agent { uid: string; email: string; name: string; role: string }

export async function getAgent(req: Request): Promise<Agent | null> {
  const payload = await getAuthUser(req) as any
  if (!payload) return null
  const db = await getDB()
  const u = await queryOne<any>(db, "SELECT uid, email, name, role FROM users WHERE lower(email)=lower(?) LIMIT 1", [payload.email || ""])
  // HRMS-issued tokens carry `modules` and own the role (single source of truth);
  // TMS-native tokens fall back to the DB role.
  const hrmsIssued = !!payload.modules
  const role = hrmsIssued ? (payload.role || u?.role) : (u?.role || payload.role)
  return {
    uid: u?.uid || payload.uid,
    email: u?.email || payload.email,
    name: u?.name || payload.name || "",
    role: role || "sales",
  }
}

export function isSales(role: string) {
  return role === "sales" || role === "sales_lead"
}
