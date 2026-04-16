'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Activity,
  AlertCircle,
  Link2,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

export default function InvestmentDashboard() {
  const { user } = useAuth()
  const [hasCredential, setHasCredential] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    checkCredential()
  }, [user])

  async function checkCredential() {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('user_broker_credentials')
        .select('id, is_paper_trading')
        .eq('is_active', true)
        .maybeSingle()

      setHasCredential(!!data)
    } catch {
      setHasCredential(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Activity className="w-6 h-6 animate-spin text-at-accent" />
      </div>
    )
  }

  // 계좌 미연결 시 연결 안내
  if (!hasCredential) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-at-surface rounded-2xl shadow-at-card p-8 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-at-accent-light mx-auto mb-4">
            <Link2 className="w-8 h-8 text-at-accent" />
          </div>
          <h2 className="text-xl font-bold text-at-text mb-2">증권 계좌를 연결하세요</h2>
          <p className="text-sm text-at-text-secondary mb-6">
            한국투자증권(KIS) 계좌를 연결하면 자동매매, 백테스트, 포트폴리오 분석 기능을 사용할 수 있습니다.
          </p>
          <Link
            href="/investment/connect"
            className="inline-flex items-center gap-2 px-6 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors"
          >
            계좌 연결하기
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-xs text-at-text-weak">
            모의투자 계좌로 먼저 시작할 수 있습니다
          </p>
        </div>
      </div>
    )
  }

  // 계좌 연결됨 → 대시보드
  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-at-text">투자 대시보드</h1>
        <p className="text-sm text-at-text-secondary mt-1">포트폴리오 현황과 활성 전략을 확인하세요</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="총 평가금액"
          value="--"
          unit="원"
          icon={Wallet}
          trend={null}
        />
        <SummaryCard
          title="오늘 손익"
          value="--"
          unit="원"
          icon={TrendingUp}
          trend={null}
        />
        <SummaryCard
          title="활성 전략"
          value="0"
          unit="개"
          icon={Target}
          trend={null}
        />
        <SummaryCard
          title="보유 종목"
          value="0"
          unit="종목"
          icon={Activity}
          trend={null}
        />
      </div>

      {/* 빈 상태 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 활성 전략 */}
        <div className="bg-at-surface rounded-2xl shadow-at-card p-6">
          <h3 className="text-base font-semibold text-at-text mb-4">활성 전략</h3>
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <Target className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">아직 활성화된 전략이 없습니다</p>
            <Link
              href="/investment/strategy"
              className="mt-3 text-sm text-at-accent hover:underline"
            >
              전략 만들기 →
            </Link>
          </div>
        </div>

        {/* 최근 신호 */}
        <div className="bg-at-surface rounded-2xl shadow-at-card p-6">
          <h3 className="text-base font-semibold text-at-text mb-4">최근 신호</h3>
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">아직 발생한 신호가 없습니다</p>
            <p className="text-xs mt-1">전략을 활성화하면 실시간 신호가 표시됩니다</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
}: {
  title: string
  value: string
  unit: string
  icon: React.ElementType
  trend: 'up' | 'down' | null
}) {
  return (
    <div className="bg-at-surface rounded-2xl shadow-at-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-at-text-secondary font-medium">{title}</span>
        <Icon className="w-4 h-4 text-at-text-weak" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${
          trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-blue-500' : 'text-at-text'
        }`}>
          {value}
        </span>
        <span className="text-sm text-at-text-weak">{unit}</span>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up' ? (
            <TrendingUp className="w-3 h-3 text-red-500" />
          ) : (
            <TrendingDown className="w-3 h-3 text-blue-500" />
          )}
        </div>
      )}
    </div>
  )
}
