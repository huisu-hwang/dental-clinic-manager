'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeftIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import CostSummaryCards from './CostSummaryCards'
import CostChart from './CostChart'
import CostTable from './CostTable'
import CostSettings from './CostSettings'

export default function CostDashboardContent() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'master_admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <CurrencyDollarIcon className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-slate-800">API 비용 대시보드</h1>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">마스터 전용</span>
          </div>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 요약 카드 */}
        <CostSummaryCards />

        {/* 기간별 차트 */}
        <CostChart />

        {/* 하단 2컬럼: 테이블 + 설정 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <CostTable />
          </div>
          <div className="xl:col-span-1">
            <CostSettings />
          </div>
        </div>
      </div>
    </div>
  )
}
