"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { AiAssistantFull } from "@/components/ai-assistant"
import type { UserRole } from "@/lib/auth-context"
import { Sparkles } from "lucide-react"

const ALL_ROLES: UserRole[] = [
    "admin",
    "owner",
    "sales_lead",
    "sales",
    "pre_ops_lead",
    "pre_ops",
    "post_ops_lead",
    "post_ops",
    "finance",
    "finance_lead",
]

export default function AssistantPage() {
    return (
        <ProtectedRoute allowedRoles={ALL_ROLES}>
            <div className="space-y-5">
                <div className="flex items-center gap-3">
                    <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center"
                        style={{ background: "rgba(6,161,92,0.1)", border: "1px solid rgba(6,161,92,0.2)" }}
                    >
                        <Sparkles className="w-5 h-5" style={{ color: "#06a15c" }} />
                    </div>
                    <div>
                        <h1 className="font-serif text-2xl tracking-wide" style={{ color: "#052210" }}>
                            Aura AI
                        </h1>
                        <p className="font-sans text-sm" style={{ color: "rgba(5,34,16,0.5)" }}>
                            SOP-grounded copilot — ask, draft itineraries, compare competitor quotes, and compose client messages. Scoped to your role.
                        </p>
                    </div>
                </div>
                <AiAssistantFull />
            </div>
        </ProtectedRoute>
    )
}
