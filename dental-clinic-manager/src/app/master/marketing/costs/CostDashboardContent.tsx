'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeftIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import CostSummaryCards from './CostSummaryCards'
import CostChart from './CostChart'
import CostTable from './CostTable'
import CostSettings from './CostSettings'
import ImageProviderSelector from './ImageProviderSelector'

interface Props {
  embedded?: boolean
}

export default function CostDashboardContent({ embedded }: Props) {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'master_admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  if (!user) return null

  // 마스터 페이지 내 탭으로 임베드된 경우
  if (embedded) {
    return (
      <div className="space-y-6">
        <CostSummaryCards />
        <CostChart />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <CostTable />
          </div>
          <div className="xl:col-span-1 space-y-6">
            <ImageProviderSelector />
            <CostSettings />
          </div>
        </div>
      </div>
    )
  }

  // 독립 페이지로 접근한 경우
  return (
    <div className="min-h-screen bg-at-surface-alt">
      {/* 헤더 */}
      <div className="bg-white border-b border-at-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-at-text-weak hover:text-at-text-secondary transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <CurrencyDollarIcon className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-at-text">API 비용 대시보드</h1>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">마스터 전용</span>
          </div>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <CostSummaryCards />
        <CostChart />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <CostTable />
          </div>
          <div className="xl:col-span-1 space-y-6">
            <ImageProviderSelector />
            <CostSettings />
          </div>
        </div>
      </div>
    </div>
  )
}
