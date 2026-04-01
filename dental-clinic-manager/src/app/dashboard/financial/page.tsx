'use client'

import FinancialDashboard from '@/components/Financial/FinancialDashboard'
import PremiumGate from '@/components/Premium/PremiumGate'

export default function FinancialPage() {
  return (
    <PremiumGate featureId="financial">
      <FinancialDashboard />
    </PremiumGate>
  )
}
