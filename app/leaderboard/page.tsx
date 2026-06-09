"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { Leaderboard } from "@/components/leaderboard"

export default function LeaderboardPage() {
    return (
        <ProtectedRoute allowedRoles={["admin", "owner", "sales_lead", "sales"]}>
            <Leaderboard />
        </ProtectedRoute>
    )
}
