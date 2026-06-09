import { DashboardLayout } from "@/components/dashboard-layout"
import "./finance-theme.css"

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
    return <DashboardLayout>{children}</DashboardLayout>
}
