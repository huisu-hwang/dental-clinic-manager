'use client'

import { useState, useEffect, useCallback } from 'react'
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
  OctagonX,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import type { InvestmentStrategy } from '@/types/investment'

export default function InvestmentDashboard() {
  const { user } = useAuth()
  const [hasCredential, setHasCredential] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [emergencyStopping, setEmergencyStopping] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('user_broker_credentials')
        .select('id, is_paper_trading')
        .eq('is_active', true)
        .maybeSingle()

      setHasCredential(!!data)

      // 전략 목록 로드
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (json.data) setStrategies(json.data)
    } catch {
      setHasCredential(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, loadData])

  const handleEmergencyStop = async () => {
    if (!confirm('모든 활성 전략을 비활성화하고 미체결 주문을 취소합니다. 계속하시겠습니까?')) return
    setEmergencyStopping(true)
    try {
      const res = await fetch('/api/investment/emergency-stop', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        alert(`긴급 정지 완료\n- 비활성화 전략: ${json.deactivatedStrategies}개\n- 취소 주문: ${json.cancelledOrders}개`)
        loadData()
      } else {
        alert(json.error || '긴급 정지 실패')
      }
    } catch {
      alert('네트워크 오류')
    } finally {
      setEmergencyStopping(false)
    }
  }

  const activeStrategies = strategies.filter(s => s.is_active)

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
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8 text-center">
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
          value={String(activeStrategies.length)}
          unit="개"
          icon={Target}
          trend={null}
        />
        <SummaryCard
          title="전체 전략"
          value={String(strategies.length)}
          unit="개"
          icon={Activity}
          trend={null}
        />
      </div>

      {/* 긴급 정지 버튼 (활성 전략이 있을 때만) */}
      {activeStrategies.length > 0 && (
        <button
          onClick={handleEmergencyStop}
          disabled={emergencyStopping}
          className="w-full py-3 bg-red-500 text-white rounded-2xl font-semibold hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {emergencyStopping ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <OctagonX className="w-5 h-5" />
          )}
          긴급 전체 정지
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 활성 전략 */}
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
          <h3 className="text-base font-semibold text-at-text mb-4">활성 전략</h3>
          {activeStrategies.length === 0 ? (
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
          ) : (
            <div className="space-y-3">
              {activeStrategies.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-at-bg">
                  <div>
                    <p className="text-sm font-medium text-at-text">{s.name}</p>
                    <p className="text-xs text-at-text-secondary mt-0.5">
                      {s.target_market === 'KR' ? '국내' : '미국'} · {s.timeframe} · Level {s.automation_level}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
                    활성
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 신호 */}
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
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
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
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
