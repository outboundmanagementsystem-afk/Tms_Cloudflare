"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

export type UserRole =
  | "admin" | "owner"
  | "sales_lead" | "sales"
  | "pre_ops_lead" | "pre_ops"
  | "post_ops_lead" | "post_ops"
  | "finance" | "finance_lead"

export interface UserProfile {
  uid: string
  name: string
  email: string
  role: UserRole
  employeeCode: string
  createdAt?: string
  department?: string
  leadId?: string
  phone?: string
}

interface AuthContextValue {
  user: UserProfile | null
  userProfile: UserProfile | null
  loading: boolean
  authError: string | null
  signInWithGoogle: () => void
  signOut: () => Promise<void>
  retryAuth: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  loading: true,
  authError: null,
  signInWithGoogle: () => {},
  signOut: async () => {},
  retryAuth: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Read user from JWT cookie via session endpoint
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(data => setUserProfile(data || null))
      .catch(() => setUserProfile(null))
      .finally(() => setLoading(false))

    // Show error from OAuth redirect (e.g. ?error=access_denied)
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    if (err) {
      const messages: Record<string, string> = {
        access_denied: "Your Google account is not registered. Contact your admin.",
        token_failed: "Google sign-in failed. Please try again.",
        server_error: "Server error during sign-in. Please try again.",
        no_code: "Sign-in was cancelled.",
        server_config_missing: "Server is not configured. Contact admin.",
      }
      setAuthError(messages[err] || "Sign-in failed. Please try again.")
    }
  }, [])

  const signInWithGoogle = () => {
    setAuthError(null)
    window.location.href = "/api/auth/google"
  }

  const retryAuth = () => {
    setAuthError(null)
    setLoading(true)
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(data => setUserProfile(data || null))
      .catch(() => setUserProfile(null))
      .finally(() => setLoading(false))
  }

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" })
    setUserProfile(null)
    window.location.href = "/login"
  }

  return (
    <AuthContext.Provider value={{ user: userProfile, userProfile, loading, authError, signInWithGoogle, signOut, retryAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
