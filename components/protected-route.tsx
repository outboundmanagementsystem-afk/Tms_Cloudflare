"use client"

import { useAuth, UserRole } from "@/lib/auth-context"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useRef, useMemo } from "react"
import { getRoleDashboard, isRoleAllowed } from "@/lib/role-utils"
import { goToHub } from "@/lib/hub"

export function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: UserRole[] }) {
    const { userProfile, loading, authError, retryAuth } = useAuth()
    const router = useRouter()
    const pathname = usePathname()
    const hasNavigated = useRef(false)

    // Memoize the roles string so it doesn't trigger useEffect on every render
    const rolesKey = useMemo(() => allowedRoles.sort().join(","), [allowedRoles])

    // Reset navigation flag when pathname changes (user navigated somewhere else)
    useEffect(() => {
        hasNavigated.current = false
    }, [pathname])

    useEffect(() => {
        if (loading) return
        if (hasNavigated.current) return

        if (!userProfile) {
            hasNavigated.current = true
            goToHub()   // no TMS login — sign in at the hub
            return
        }

        const allowed = isRoleAllowed(userProfile.role, rolesKey.split(","))
        if (!allowed) {
            const target = getRoleDashboard(userProfile.role)
            if (target !== pathname) {
                hasNavigated.current = true
                console.log(`ProtectedRoute: Role "${userProfile.role}" not allowed. Redirecting to "${target}"`)
                router.replace(target)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, loading, rolesKey, pathname])

    // Auth error — show retry UI
    if (authError && !loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: '#031A0C' }}>
                <p className="font-sans text-sm tracking-widest uppercase mb-2" style={{ color: '#ef4444' }}>
                    Authentication Error
                </p>
                <p className="font-sans text-xs mb-6 max-w-md" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {authError}
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={retryAuth}
                        className="px-6 py-2 rounded-lg font-sans text-xs tracking-widest uppercase transition-all hover:bg-white/10"
                        style={{ border: '1px solid rgba(212,175,55,0.5)', color: '#D4AF37' }}
                    >
                        Retry
                    </button>
                    <button
                        onClick={() => { hasNavigated.current = true; goToHub() }}
                        className="px-6 py-2 rounded-lg font-sans text-xs tracking-widest uppercase transition-all hover:bg-white/10"
                        style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }}
                    >
                        Back to Hub
                    </button>
                </div>
            </div>
        )
    }

    // Loading state
    if (loading) return (
        <div style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            height:"100vh", background:"#031A0C", flexDirection:"column", gap:"16px"
        }}>
            <div style={{
                width:"40px", height:"40px",
                border:"4px solid rgba(212,175,55,0.3)",
                borderTop:"4px solid #D4AF37",
                borderRadius:"50%", animation:"spin 1s linear infinite"
            }}/>
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </div>
    )

    if (!userProfile) {
        goToHub()
        return null
    }

    // Not allowed role — render nothing while redirect happens
    if (!isRoleAllowed(userProfile.role, allowedRoles)) {
        return null
    }

    return <>{children}</>
}
