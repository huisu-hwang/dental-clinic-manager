import { Metadata } from 'next'
import CostDashboardContent from './CostDashboardContent'

export const metadata: Metadata = {
  title: 'API 비용 대시보드 | 마스터',
}

export default function CostDashboardPage() {
  return <CostDashboardContent />
}
