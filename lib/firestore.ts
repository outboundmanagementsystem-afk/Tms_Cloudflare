// ─── Data access layer — Cloudflare D1 via fetch to API routes ───────────────
// Drop-in replacement for the Firebase Firestore version.
// All function signatures are identical; only the implementation changed.

const BASE = ""  // same origin — works on both localhost and Cloudflare

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`API ${path} → ${res.status}: ${txt}`)
  }
  return res.json()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItineraryStatus =
  | "draft" | "sent" | "confirmed" | "handover"
  | "pre-ops" | "post-ops" | "completed"

export interface AccessToken {
  id: string
  itineraryId: string
  requestedBy: string
  requestedByName: string
  requestedByRole: string
  requestedAt: string
  reason: string
  status: "pending" | "approved" | "rejected"
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  expiresAt?: string
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUsers() {
  return api("/api/users")
}

export async function preRegisterUser(
  email: string, role: any, name: string, employeeCode: string,
  department?: string, leadId?: string, phone?: string
) {
  const res = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, role, name, employeeCode, department, leadId, phone }),
  })
  return res.uid
}

export async function generateEmployeeCode(role: string): Promise<string> {
  const prefix: Record<string, string> = {
    sales: "SL", sales_lead: "SLL", pre_ops: "PO", pre_ops_lead: "POL",
    post_ops: "PSO", post_ops_lead: "PSOL", finance: "FN", finance_lead: "FNL",
    admin: "AD", owner: "OW",
  }
  const p = prefix[role] || "XX"
  return `${p}${Date.now().toString().slice(-4)}`
}

export async function updateUser(uid: string, data: any) {
  return api(`/api/users/${uid}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function updateUserRole(uid: string, role: string) {
  return api(`/api/users/${uid}`, { method: "PUT", body: JSON.stringify({ role }) })
}

export async function deleteUser(uid: string) {
  return api(`/api/users/${uid}`, { method: "DELETE" })
}

// ─── Destinations ─────────────────────────────────────────────────────────────

export async function getDestinations() {
  return api("/api/destinations")
}

export async function getDestination(id: string) {
  return api(`/api/destinations/${id}`)
}

export async function createDestination(data: any) {
  const res = await api("/api/destinations", { method: "POST", body: JSON.stringify(data) })
  return res.id
}

export async function updateDestination(id: string, data: any) {
  return api(`/api/destinations/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteDestination(id: string) {
  return api(`/api/destinations/${id}`, { method: "DELETE" })
}

export async function clearDestinationSubcollections(id: string) {
  for (const sub of ["hotels","activities","transfers","vehicleRules","dayPlans","attractions"]) {
    await api(`/api/destinations/${id}/${sub}`, { method: "DELETE" }).catch(() => {})
  }
}

// Destination subcollections
const destSub = (destId: string, sub: string) => `/api/destinations/${destId}/${sub}`

export async function getHotels(destId: string) { return api(destSub(destId, "hotels")) }
export async function addHotel(destId: string, data: any) { return api(destSub(destId, "hotels"), { method: "POST", body: JSON.stringify(data) }) }
export async function updateHotel(destId: string, id: string, data: any) { return api(`${destSub(destId, "hotels")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteHotel(destId: string, id: string) { return api(`${destSub(destId, "hotels")}/${id}`, { method: "DELETE" }) }

export async function getAttractions(destId: string) { return api(destSub(destId, "attractions")) }
export async function addAttraction(destId: string, data: any) { return api(destSub(destId, "attractions"), { method: "POST", body: JSON.stringify(data) }) }
export async function updateAttraction(destId: string, id: string, data: any) { return api(`${destSub(destId, "attractions")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteAttraction(destId: string, id: string) { return api(`${destSub(destId, "attractions")}/${id}`, { method: "DELETE" }) }

export async function getActivities(destId: string) { return api(destSub(destId, "activities")) }
export async function addActivity(destId: string, data: any) { return api(destSub(destId, "activities"), { method: "POST", body: JSON.stringify(data) }) }
export async function updateActivity(destId: string, id: string, data: any) { return api(`${destSub(destId, "activities")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteActivity(destId: string, id: string) { return api(`${destSub(destId, "activities")}/${id}`, { method: "DELETE" }) }

export async function getPresetDays(destId: string) { return api(destSub(destId, "dayPlans")) }
export async function addPresetDay(destId: string, data: any) { return api(destSub(destId, "dayPlans"), { method: "POST", body: JSON.stringify(data) }) }
export async function updatePresetDay(destId: string, id: string, data: any) { return api(`${destSub(destId, "dayPlans")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deletePresetDay(destId: string, id: string) { return api(`${destSub(destId, "dayPlans")}/${id}`, { method: "DELETE" }) }

export async function getVehicleRules(destId: string) { return api(destSub(destId, "vehicleRules")) }
export async function addVehicleRule(destId: string, data: any) { return api(destSub(destId, "vehicleRules"), { method: "POST", body: JSON.stringify(data) }) }
export async function updateVehicleRule(destId: string, id: string, data: any) { return api(`${destSub(destId, "vehicleRules")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteVehicleRule(destId: string, id: string) { return api(`${destSub(destId, "vehicleRules")}/${id}`, { method: "DELETE" }) }

export async function getTransfers(destId: string) { return api(destSub(destId, "transfers")) }
export async function addTransfer(destId: string, data: any) { return api(destSub(destId, "transfers"), { method: "POST", body: JSON.stringify(data) }) }
export async function updateTransfer(destId: string, id: string, data: any) { return api(`${destSub(destId, "transfers")}/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteTransfer(destId: string, id: string) { return api(`${destSub(destId, "transfers")}/${id}`, { method: "DELETE" }) }

// ─── Itineraries ──────────────────────────────────────────────────────────────

export async function getItineraries(salesUid?: string, status?: ItineraryStatus) {
  const p = new URLSearchParams()
  if (salesUid) p.set("createdBy", salesUid)
  if (status) p.set("status", status)
  return api(`/api/itineraries?${p}`)
}

export async function getItinerary(id: string) {
  return api(`/api/itineraries/${id}`)
}

export async function getItinerariesByStatus(status: ItineraryStatus, salesUid?: string) {
  const p = new URLSearchParams({ status })
  if (salesUid) p.set("createdBy", salesUid)
  return api(`/api/itineraries?${p}`)
}

export async function createItinerary(data: any) {
  const res = await api("/api/itineraries", { method: "POST", body: JSON.stringify(data) })
  return res.id
}

export async function updateItinerary(id: string, data: any) {
  return api(`/api/itineraries/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function updateItineraryStatus(id: string, status: ItineraryStatus, extraData: Record<string, any> = {}) {
  return api(`/api/itineraries/${id}/status`, { method: "PUT", body: JSON.stringify({ status, ...extraData }) })
}

export async function updateItineraryStage(id: string, stage: string) {
  return api(`/api/itineraries/${id}`, { method: "PUT", body: JSON.stringify({ postOpStage: stage }) })
}

export async function deleteItinerary(id: string) {
  return api(`/api/itineraries/${id}`, { method: "DELETE" })
}

// Itinerary subcollections
const sub = (itinId: string, s: string) => `/api/itineraries/${itinId}/${s}`

export async function getItineraryDays(itinId: string)     { return api(sub(itinId, "days")) }
export async function addItineraryDay(itinId: string, d: any)  { return api(sub(itinId, "days"), { method: "POST", body: JSON.stringify(d) }) }
export async function updateItineraryDay(itinId: string, id: string, d: any) { return api(`${sub(itinId, "days")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }
export async function deleteItineraryDay(itinId: string, id: string) { return api(`${sub(itinId, "days")}/${id}`, { method: "DELETE" }) }

export async function getItineraryHotels(itinId: string)   { return api(sub(itinId, "hotels")) }
export async function addItineraryHotel(itinId: string, d: any) { return api(sub(itinId, "hotels"), { method: "POST", body: JSON.stringify(d) }) }
export async function updateItineraryHotel(itinId: string, id: string, d: any) { return api(`${sub(itinId, "hotels")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }

export async function getItineraryFlights(itinId: string)  { return api(sub(itinId, "flights")) }
export async function addItineraryFlight(itinId: string, d: any) { return api(sub(itinId, "flights"), { method: "POST", body: JSON.stringify(d) }) }
export async function updateItineraryFlight(itinId: string, id: string, d: any) { return api(`${sub(itinId, "flights")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }
export async function deleteItineraryFlight(itinId: string, id: string) { return api(`${sub(itinId, "flights")}/${id}`, { method: "DELETE" }) }

export async function getItineraryTransfers(itinId: string) { return api(sub(itinId, "transfers")) }
export async function addItineraryTransfer(itinId: string, d: any) { return api(sub(itinId, "transfers"), { method: "POST", body: JSON.stringify(d) }) }

export async function getItineraryActivities(itinId: string) { return api(sub(itinId, "activities")) }
export async function addItineraryActivity(itinId: string, d: any) { return api(sub(itinId, "activities"), { method: "POST", body: JSON.stringify(d) }) }

export async function getItineraryPricing(itinId: string)  { return api(sub(itinId, "pricing")) }
export async function addItineraryPricing(itinId: string, d: any) { return api(sub(itinId, "pricing"), { method: "POST", body: JSON.stringify(d) }) }

export async function getItineraryPayments(itinId: string) { return api(sub(itinId, "payments")) }
export async function addPayment(itinId: string, d: any) {
  // The payments POST route inserts the payment and recomputes amount_paid atomically
  // (server-side), so no client-side read-modify-write is needed.
  return api(sub(itinId, "payments"), { method: "POST", body: JSON.stringify(d) })
}
export async function getAllPayments() {
  const itins = await getItineraries()
  const all: any[] = []
  await Promise.all(itins.map(async (it: any) => {
    const payments = await getItineraryPayments(it.id)
    payments.forEach((p: any) => all.push({ ...p, itinerary: it }))
  }))
  return all
}

// Checklists
export async function getSopChecklist(itinId: string)      { return api(sub(itinId, "sopChecklist")) }
export async function initSopChecklist(itinId: string)     { return updateItineraryStatus(itinId, "handover") }
export async function syncChecklist(itinId: string, dept: string, col: string) {
  return api(`/api/itineraries/${itinId}/sync-checklist`, { method: "POST", body: JSON.stringify({ department: dept }) }).catch(() => null)
}
export async function updateSopItem(itinId: string, id: string, d: any) { return api(`${sub(itinId, "sopChecklist")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }

export async function getPostOpsChecklist(itinId: string)  { return api(sub(itinId, "postOpsChecklist")) }
export async function initPostOpsChecklist(itinId: string) { return updateItineraryStatus(itinId, "post-ops") }
export async function updatePostOpsItem(itinId: string, id: string, d: any) { return api(`${sub(itinId, "postOpsChecklist")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }

export async function getSalesChecklist(itinId: string)    { return api(sub(itinId, "salesChecklist")) }
export async function initSalesChecklist(itinId: string)   { return api(`/api/itineraries/${itinId}/sync-checklist`, { method: "POST", body: JSON.stringify({ department: "sales" }) }).catch(() => null) }
export async function updateSalesItem(itinId: string, id: string, d: any) { return api(`${sub(itinId, "salesChecklist")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }

export async function getPostOpsData(itinId: string)       { return api(sub(itinId, "postOpsData")).catch(() => null) }
export async function updatePostOpsData(itinId: string, d: any) { return api(sub(itinId, "postOpsData"), { method: "POST", body: JSON.stringify(d) }) }

export async function getItinSub(itinId: string, subCollection: string) { return api(sub(itinId, subCollection)) }

// DMC management — role-scoped DMC details aggregated from bookings' sales checklists.
export async function getDmcRecords(role: string, uid: string) {
  return api(`/api/dmc?role=${encodeURIComponent(role)}&uid=${encodeURIComponent(uid)}`)
}

// ─── Passwords ──────────────────────────────────────────────────────────────
// Admin sets/resets another user's password.
export async function setUserPassword(uid: string, newPassword: string) {
  return api("/api/auth/set-password", { method: "POST", body: JSON.stringify({ uid, newPassword }) })
}
// A user changes their own password.
export async function changeMyPassword(currentPassword: string, newPassword: string) {
  return api("/api/auth/set-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) })
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function getPackages() { return api("/api/packages") }
export async function getPackage(id: string) { return api(`/api/packages/${id}`) }
export async function createPackage(data: any) { const r = await api("/api/packages", { method: "POST", body: JSON.stringify(data) }); return r.id }
export async function updatePackage(id: string, data: any) { return api(`/api/packages/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deletePackage(id: string) { return api(`/api/packages/${id}`, { method: "DELETE" }) }

const pkgSub = (pkgId: string, s: string) => `/api/packages/${pkgId}/${s}`
export async function getPackageDays(pkgId: string)     { return api(pkgSub(pkgId, "days")) }
export async function addPackageDay(pkgId: string, d: any) { return api(pkgSub(pkgId, "days"), { method: "POST", body: JSON.stringify(d) }) }
export async function updatePackageDay(pkgId: string, id: string, d: any) { return api(`${pkgSub(pkgId, "days")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }
export async function deletePackageDay(pkgId: string, id: string) { return api(`${pkgSub(pkgId, "days")}/${id}`, { method: "DELETE" }) }

export async function getPackageHotels(pkgId: string)   { return api(pkgSub(pkgId, "hotels")) }
export async function addPackageHotel(pkgId: string, d: any) { return api(pkgSub(pkgId, "hotels"), { method: "POST", body: JSON.stringify(d) }) }
export async function updatePackageHotel(pkgId: string, id: string, d: any) { return api(`${pkgSub(pkgId, "hotels")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }
export async function deletePackageHotel(pkgId: string, id: string) { return api(`${pkgSub(pkgId, "hotels")}/${id}`, { method: "DELETE" }) }

export async function getPackageFlights(pkgId: string)  { return api(pkgSub(pkgId, "flights")) }
export async function addPackageFlight(pkgId: string, d: any) { return api(pkgSub(pkgId, "flights"), { method: "POST", body: JSON.stringify(d) }) }
export async function updatePackageFlight(pkgId: string, id: string, d: any) { return api(`${pkgSub(pkgId, "flights")}/${id}`, { method: "PUT", body: JSON.stringify(d) }) }
export async function deletePackageFlight(pkgId: string, id: string) { return api(`${pkgSub(pkgId, "flights")}/${id}`, { method: "DELETE" }) }

export async function getPackageTransfers(pkgId: string) { return api(pkgSub(pkgId, "transfers")) }
export async function addPackageTransfer(pkgId: string, d: any) { return api(pkgSub(pkgId, "transfers"), { method: "POST", body: JSON.stringify(d) }) }
export async function deletePackageTransfer(pkgId: string, id: string) { return api(`${pkgSub(pkgId, "transfers")}/${id}`, { method: "DELETE" }) }

export async function getPackageActivities(pkgId: string) { return api(pkgSub(pkgId, "activities")) }
export async function addPackageActivity(pkgId: string, d: any) { return api(pkgSub(pkgId, "activities"), { method: "POST", body: JSON.stringify(d) }) }
export async function deletePackageActivity(pkgId: string, id: string) { return api(`${pkgSub(pkgId, "activities")}/${id}`, { method: "DELETE" }) }

export async function getPackagePricing(pkgId: string)  { return api(pkgSub(pkgId, "pricing")) }
export async function addPackagePricing(pkgId: string, d: any) { return api(pkgSub(pkgId, "pricing"), { method: "POST", body: JSON.stringify(d) }) }

// ─── Customers ────────────────────────────────────────────────────────────────

export async function getCustomers(salesUid?: string) {
  const p = salesUid ? `?createdBy=${salesUid}` : ""
  return api(`/api/customers${p}`)
}

export async function getCustomerByPhone(phone: string) {
  return api(`/api/customers?phone=${encodeURIComponent(phone)}`)
}

export async function createCustomer(data: any) {
  const r = await api("/api/customers", { method: "POST", body: JSON.stringify(data) })
  return r.id
}

export async function updateCustomer(id: string, data: any) {
  return api(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteCustomer(id: string) {
  return api(`/api/customers/${id}`, { method: "DELETE" })
}

export async function deleteAllCustomers() {
  return api("/api/customers?all=true", { method: "DELETE" })
}

export async function getCustomerItineraries(customerId: string) {
  return api(`/api/itineraries?customerId=${customerId}`)
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function getDrafts(userId: string)     { return api(`/api/drafts?userId=${userId}`) }
export async function getDraft(id: string)          { return api(`/api/drafts/${id}`) }
export async function saveDraft(data: any)          { const r = await api("/api/drafts", { method: "POST", body: JSON.stringify(data) }); return r.id }
export async function updateDraft(id: string, data: any) { return api(`/api/drafts/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteDraft(id: string)       { return api(`/api/drafts/${id}`, { method: "DELETE" }) }

// ─── SOPs ─────────────────────────────────────────────────────────────────────

export async function getSOPs(department?: string) {
  const p = department ? `?department=${department}` : ""
  return api(`/api/sops${p}`)
}
export async function createSOP(data: any) { const r = await api("/api/sops", { method: "POST", body: JSON.stringify(data) }); return r.id }
export async function updateSOP(id: string, data: any) { return api(`/api/sops/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
export async function deleteSOP(id: string) { return api(`/api/sops/${id}`, { method: "DELETE" }) }

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(id: string) {
  return api(`/api/settings/${id}`).catch(() => null)
}
export async function updateSettings(id: string, data: any) {
  return api(`/api/settings/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

// ─── Access Tokens ────────────────────────────────────────────────────────────

export async function createAccessTokenRequest(
  itineraryId: string, requestedBy: string, requestedByName: string,
  requestedByRole: string, reason: string
): Promise<string> {
  const r = await api("/api/access-tokens", {
    method: "POST",
    body: JSON.stringify({ itineraryId, requestedBy, requestedByName, requestedByRole, reason }),
  })
  return r.id
}

export async function getAccessTokensForItinerary(itineraryId: string): Promise<AccessToken[]> {
  return api(`/api/access-tokens?itineraryId=${itineraryId}`)
}

/** Access tokens that a given user requested (any status) — used to notify the requester
 *  when their request is approved or rejected. */
export async function getMyAccessTokens(uid: string): Promise<AccessToken[]> {
  return api(`/api/access-tokens?requestedBy=${encodeURIComponent(uid)}`).catch(() => [])
}

export async function approveAccessToken(tokenId: string, approvedBy: string, approvedByName: string) {
  return api(`/api/access-tokens/${tokenId}`, {
    method: "PUT",
    body: JSON.stringify({ action: "approve", approvedBy, approvedByName }),
  })
}

export async function rejectAccessToken(tokenId: string, rejectedBy: string, rejectedByName: string) {
  return api(`/api/access-tokens/${tokenId}`, {
    method: "PUT",
    body: JSON.stringify({ action: "reject", approvedBy: rejectedBy, approvedByName: rejectedByName }),
  })
}

export async function getPendingTokensWithItineraries(): Promise<Array<AccessToken & { itinerary: any }>> {
  const tokens: AccessToken[] = await api("/api/access-tokens?status=pending")
  if (!tokens.length) return []
  const itineraries = await Promise.all(tokens.map(t => getItinerary(t.itineraryId).catch(() => null)))
  return tokens.map((t, i) => ({ ...t, itinerary: itineraries[i] }))
}

// ─── Bulk / admin helpers ─────────────────────────────────────────────────────

export async function clearItinerarySubcollections(itinId: string) {
  for (const s of ["days","hotels","flights","transfers","activities","pricing","payments","sopChecklist","postOpsChecklist","salesChecklist","tripNotes"]) {
    await api(`/api/itineraries/${itinId}/${s}`, { method: "DELETE" }).catch(() => {})
  }
}

export async function clearPackageSubcollections(pkgId: string) {
  for (const s of ["days","hotels","flights","transfers","activities","pricing"]) {
    await api(`/api/packages/${pkgId}/${s}`, { method: "DELETE" }).catch(() => {})
  }
}

export async function deleteAllItineraries() {
  const all = await getItineraries()
  await Promise.all(all.map((it: any) => deleteItinerary(it.id)))
}

export async function deleteAllNonAdminUsers() {
  const all = await getUsers()
  await Promise.all(all.filter((u: any) => u.role !== "admin" && u.role !== "owner").map((u: any) => deleteUser(u.uid)))
}

export async function seedCreateRawItinerary(data: any) {
  return createItinerary(data)
}

// ─── Quote ID generator ───────────────────────────────────────────────────────

export async function generateQuoteId(destination: string): Promise<string> {
  const prefix = destination.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, "X")
  // Try up to 10 times to get a unique ID
  for (let i = 0; i < 10; i++) {
    const num = String(Math.floor(Math.random() * 9000) + 1000)
    const candidate = `OT${prefix}${num}`
    try {
      const existing = await api(`/api/itineraries?quoteId=${candidate}`)
      if (!existing || existing.length === 0) return candidate
    } catch {
      return candidate
    }
  }
  // Fallback: use timestamp to guarantee uniqueness
  return `OT${prefix}${Date.now().toString().slice(-6)}`
}
