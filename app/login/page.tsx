"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { getRoleDashboard } from "@/lib/role-utils"
import { goToHub } from "@/lib/hub"

// TMS has no login of its own. Identity is owned by Outbound HR (the hub).
// If a valid session is already present → go to the role dashboard; otherwise
// send the user to the hub to sign in there.
export default function LoginPage() {
  const { userProfile, loading } = useAuth()
  const router = useRouter()
  const done = useRef(false)

  useEffect(() => {
    if (loading || done.current) return
    done.current = true
    if (userProfile) {
      const target = getRoleDashboard(userProfile.role)
      router.replace(target !== "/login" ? target : "/admin")
    } else {
      goToHub()
    }
  }, [userProfile, loading, router])

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#031A0C", color: "rgba(255,255,255,0.6)",
      fontFamily: "sans-serif", fontSize: 13, letterSpacing: "0.1em",
    }}>
      Redirecting to Outbound Management…
    </div>
  )
}
