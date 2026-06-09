"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SalesRootPage() {
    const router = useRouter()
    useEffect(() => {
        router.replace("/sales/today")
    }, [router])

    return (
        <div className="h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-t-transparent border-emerald-600 rounded-full animate-spin" />
        </div>
    )
}
