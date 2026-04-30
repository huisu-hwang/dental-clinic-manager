'use client'

import MonthlyReportContainer from '@/components/MonthlyReport/MonthlyReportContainer'
import PremiumGate from '@/components/Premium/PremiumGate'

export default function MonthlyReportPage() {
  return (
    <PremiumGate featureId="monthly-report">
      <MonthlyReportContainer />
    </PremiumGate>
  )
}
