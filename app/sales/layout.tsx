import { DashboardLayout } from "@/components/dashboard-layout"
import { QuoteBanger } from "@/components/crm/quote-banger"

export default function SalesLayout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout>
            {children}
            <QuoteBanger />
        </DashboardLayout>
    )
}
