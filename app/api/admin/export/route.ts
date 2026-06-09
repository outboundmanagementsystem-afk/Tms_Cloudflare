import { getDB } from "@/lib/db"
import { verifyJWT, getSecret } from "@/lib/jwt"

// Every table in the D1 schema — a complete database dump.
const TABLES = [
  "users",
  "destinations",
  "destination_hotels", "destination_activities", "destination_transfers",
  "destination_vehicle_rules", "destination_day_plans", "destination_attractions",
  "itineraries",
  "itinerary_days", "itinerary_hotels", "itinerary_flights", "itinerary_transfers",
  "itinerary_activities", "itinerary_pricing", "itinerary_payments",
  "itinerary_sop_checklist", "itinerary_post_ops_checklist", "itinerary_sales_checklist",
  "itinerary_post_ops_data", "itinerary_trip_notes",
  "packages", "package_days", "package_hotels", "package_flights",
  "package_transfers", "package_activities", "package_pricing",
  "customers", "drafts", "sops", "settings", "access_tokens",
]

async function requireAdmin(req: Request): Promise<boolean> {
  try {
    const cookie = req.headers.get("cookie") || ""
    const token = cookie.split(";").map(c => c.trim()).find(c => c.startsWith("token="))?.split("=").slice(1).join("=")
    if (!token) return false
    const payload = await verifyJWT(token, getSecret())
    return !!payload && (payload.role === "admin" || payload.role === "owner")
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  const db = await getDB()
  const dump: Record<string, any[]> = {}
  const counts: Record<string, number> = {}

  for (const table of TABLES) {
    try {
      const { results } = await db.prepare(`SELECT * FROM ${table}`).all()
      let rows = (results as any[]) || []
      // Never export password hashes
      if (table === "users") rows = rows.map(({ password_hash, ...r }) => r)
      dump[table] = rows
      counts[table] = rows.length
    } catch (e: any) {
      dump[table] = []
      counts[table] = 0
    }
  }

  return Response.json(
    {
      exportedAt: new Date().toISOString(),
      database: "outbound-tms",
      counts,
      tables: dump,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="tms-database-export.json"`,
        "Cache-Control": "no-store",
      },
    }
  )
}
