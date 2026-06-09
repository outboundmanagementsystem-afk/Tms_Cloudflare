"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { HUB_URL } from "@/lib/hub"
import { Users } from "lucide-react"

// User creation/management is HRMS-only. This screen is intentionally read-only
// and points admins to Outbound HR (the single place accounts + roles are set).
export default function UsersPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "owner"]}>
        <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: "60vh", padding: 24 }}>
          <div className="flex items-center justify-center rounded-2xl mb-5"
            style={{ width: 64, height: 64, background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
            <Users className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: "#0f1f17" }}>
            Users are managed in Outbound HR
          </h1>
          <p className="text-sm max-w-md mb-6" style={{ color: "rgba(15,31,23,0.6)" }}>
            Every account — and each person&apos;s TMS role — is created and managed centrally
            in Outbound HR. There is no separate user setup inside TMS.
          </p>
          <a href={HUB_URL}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "#10b981", color: "#fff" }}>
            Open Outbound Management
          </a>
        </div>
    </ProtectedRoute>
  )
}
