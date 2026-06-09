// Central D1 database helper
// All API routes import getDB() from here instead of referencing Cloudflare env directly.

import { getCloudflareContext } from "@opennextjs/cloudflare"

export interface Env {
  DB: D1Database
  FILES: R2Bucket
}

export async function getDB(): Promise<D1Database> {
  try {
    const { env } = await getCloudflareContext<Env>()
    if (!env?.DB) throw new Error("D1 binding 'DB' not found. Ensure wrangler.jsonc has d1_databases configured and you are running via wrangler (not plain next dev).")
    return env.DB
  } catch (err: any) {
    throw new Error(`D1 unavailable: ${err.message}`)
  }
}

export async function getR2(): Promise<R2Bucket> {
  try {
    const { env } = await getCloudflareContext<Env>()
    if (!env?.FILES) throw new Error("R2 binding 'FILES' not found. Ensure wrangler.jsonc has r2_buckets configured.")
    return env.FILES
  } catch (err: any) {
    throw new Error(`R2 unavailable: ${err.message}`)
  }
}

// ── Generic helpers ───────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

/** Run a SELECT that returns multiple rows, each merged with their parsed JSON `data` column. */
export async function queryRows<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return (results as any[]).map(expandData) as T[]
}

/** Run a SELECT that returns a single row merged with its parsed JSON `data` column. */
export async function queryOne<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql)
  const row = await (params.length ? stmt.bind(...params) : stmt).first()
  if (!row) return null
  return expandData(row) as T
}

/** Execute an INSERT / UPDATE / DELETE statement. */
export async function execute(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<D1Result> {
  const stmt = db.prepare(sql)
  return params.length ? stmt.bind(...params).run() : stmt.run()
}

/**
 * Merge the JSON `data` column back into the row object so callers
 * receive a flat object matching the old Firestore document shape.
 */
function expandData(row: Record<string, any>): Record<string, any> {
  if (!row) return row
  let extra: Record<string, any> = {}
  if (typeof row.data === "string") {
    try { extra = JSON.parse(row.data) } catch { /* ignore */ }
  }
  if (typeof row.extra === "string") {
    try { Object.assign(extra, JSON.parse(row.extra)) } catch { /* ignore */ }
  }
  const { data: _d, extra: _e, ...rest } = row
  // camelCase the snake_case column names
  const camel = toCamel(rest)
  // Parse known JSON-string columns back into objects/arrays (itineraries.plans, sops.items/categories)
  for (const k of ["plans", "items", "categories"]) {
    if (typeof camel[k] === "string") {
      try { camel[k] = JSON.parse(camel[k]) } catch { /* leave as-is */ }
    }
  }
  return { ...extra, ...camel }
}

/** Convert a flat snake_case object to camelCase. */
function toCamel(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    result[snakeToCamel(k)] = v
  }
  return result
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Convert a camelCase object to snake_case for INSERT/UPDATE. */
export function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    result[camelToSnake(k)] = v
  }
  return result
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}

/** Build an UPDATE SET clause and params array from a camelCase patch object.
 *  Skips `id`, `createdAt`, `data`, `extra`. */
export function buildUpdate(
  patch: Record<string, any>,
  skipKeys: string[] = []
): { setClauses: string[]; values: any[] } {
  const skip = new Set(["id", "createdAt", "data", "extra", ...skipKeys])
  const setClauses: string[] = []
  const values: any[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (skip.has(k)) continue
    if (v === undefined) continue
    setClauses.push(`${camelToSnake(k)} = ?`)
    // D1 binding doesn't reliably accept JS booleans → coerce to 1/0; objects → JSON.
    values.push(
      typeof v === "boolean" ? (v ? 1 : 0)
        : (typeof v === "object" && v !== null ? JSON.stringify(v) : v)
    )
  }
  return { setClauses, values }
}
