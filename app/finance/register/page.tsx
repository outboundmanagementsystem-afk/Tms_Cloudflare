"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { RegisterView } from "@/components/finance/register-view"

export default function FinanceRegisterPage() {
    return (
        <ProtectedRoute allowedRoles={["finance", "finance_lead", "admin", "owner"]}>
            <RegisterView />
        </ProtectedRoute>
    )
}
