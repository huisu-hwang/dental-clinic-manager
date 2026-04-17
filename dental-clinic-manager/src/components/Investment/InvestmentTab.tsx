'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Link2, Target, TrendingUp, Briefcase,
  Wallet, Activity, AlertCircle, OctagonX, Loader2,
  ArrowRight, Plus, Play, Pause, Trash2, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import ConnectContent from './ConnectContent'
import TradingContent from './TradingContent'
import type { InvestmentStrategy } from '@/types/investment'

type SubTab = 'dashboard' | 'connect' | 'strategy' | 'trading' | 'portfolio'

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'connect', label: '계좌 연결', icon: Link2 },
  { id: 'strategy', label: '전략 관리', icon: Target },
  { id: 'trading', label: '자동매매', icon: TrendingUp },
  { id: 'portfolio', label: '포트폴리오', icon: Briefcase },
]

export default function InvestmentTab() {
  const { user } = useAuth()
  const [subTab, setSubTab] = useState<SubTab>('dashboard')
  const [hasCredential, setHasCredential] = useState<boolean | null>(null)
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [loading, setLoading] = useState(true)
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
    if (user) loadData()
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
      }
    } catch { /* ignore */ } finally { setEmergencyStopping(false) }
  }

  const activeStrategies = strategies.filter(s => s.is_active)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      {/* 서브메뉴 탭 - 근태/마케팅 페이지와 동일 패턴 */}
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {SUB_TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
                  subTab === tab.id
                    ? 'bg-at-accent-light text-at-accent'
                    : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 서브탭 콘텐츠 */}
      <div className="p-4 sm:p-6">
        {subTab === 'dashboard' && (
          <DashboardSubTab
            hasCredential={hasCredential}
            strategies={strategies}
            activeStrategies={activeStrategies}
            emergencyStopping={emergencyStopping}
            onEmergencyStop={handleEmergencyStop}
            onNavigate={setSubTab}
          />
        )}
        {subTab === 'connect' && (
          <ConnectContent onCredentialChange={loadData} />
        )}
        {subTab === 'strategy' && (
          <StrategySubTab strategies={strategies} onRefresh={loadData} />
        )}
        {subTab === 'trading' && (
          <TradingContent />
        )}
        {subTab === 'portfolio' && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-at-surface-alt flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-at-text-weak" />
            </div>
            <h3 className="text-lg font-bold text-at-text mb-2">포트폴리오</h3>
            <p className="text-sm text-at-text-secondary">포트폴리오 분석 기능은 준비 중입니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// 서브탭 컴포넌트들
// ============================================

function DashboardSubTab({ hasCredential, strategies, activeStrategies, emergencyStopping, onEmergencyStop, onNavigate }: {
  hasCredential: boolean | null
  strategies: InvestmentStrategy[]
  activeStrategies: InvestmentStrategy[]
  emergencyStopping: boolean
  onEmergencyStop: () => void
  onNavigate: (tab: SubTab) => void
}) {
  if (!hasCredential) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="bg-white rounded-3xl shadow-sm border border-at-border p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-at-accent-light flex items-center justify-center mx-auto mb-4">
            <Link2 className="w-8 h-8 text-at-accent" />
          </div>
          <h2 className="text-xl font-bold text-at-text mb-2">증권 계좌를 연결하세요</h2>
          <p className="text-sm text-at-text-secondary mb-6">
            한국투자증권(KIS) 계좌를 연결하면 자동매매, 백테스트, 포트폴리오 분석 기능을 사용할 수 있습니다.
          </p>
          <button
            onClick={() => onNavigate('connect')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors"
          >
            계좌 연결하기 <ArrowRight className="w-4 h-4" />
          </button>
          <p className="mt-4 text-xs text-at-text-weak">모의투자 계좌로 먼저 시작할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-at-text">투자 대시보드</h2>
        <p className="text-sm text-at-text-secondary mt-1">포트폴리오 현황과 활성 전략을 확인하세요</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="총 평가금액" value="--" unit="원" icon={Wallet} />
        <SummaryCard title="오늘 손익" value="--" unit="원" icon={TrendingUp} />
        <SummaryCard title="활성 전략" value={String(activeStrategies.length)} unit="개" icon={Target} />
        <SummaryCard title="전체 전략" value={String(strategies.length)} unit="개" icon={Activity} />
      </div>

      {/* 긴급 정지 */}
      {activeStrategies.length > 0 && (
        <button
          onClick={onEmergencyStop}
          disabled={emergencyStopping}
          className="w-full py-3 bg-at-error text-white rounded-2xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {emergencyStopping ? <Loader2 className="w-5 h-5 animate-spin" /> : <OctagonX className="w-5 h-5" />}
          긴급 전체 정지
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 활성 전략 */}
        <div className="bg-white rounded-3xl shadow-sm border border-at-border overflow-hidden">
          <div className="px-6 py-4 border-b border-at-border">
            <h3 className="text-base font-semibold text-at-text">활성 전략</h3>
          </div>
          <div className="p-6">
            {activeStrategies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                <Target className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">활성화된 전략이 없습니다</p>
                <button onClick={() => onNavigate('strategy')} className="mt-3 text-sm text-at-accent hover:underline">
                  전략 만들기 →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStrategies.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-at-surface-alt border border-at-border">
                    <div>
                      <p className="text-sm font-medium text-at-text">{s.name}</p>
                      <p className="text-xs text-at-text-secondary mt-0.5">
                        {s.target_market === 'KR' ? '국내' : '미국'} · {s.timeframe} · Level {s.automation_level}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-at-success border border-green-200 font-medium">활성</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 최근 신호 */}
        <div className="bg-white rounded-3xl shadow-sm border border-at-border overflow-hidden">
          <div className="px-6 py-4 border-b border-at-border">
            <h3 className="text-base font-semibold text-at-text">최근 신호</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
              <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">아직 발생한 신호가 없습니다</p>
              <p className="text-xs mt-1">전략을 활성화하면 실시간 신호가 표시됩니다</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StrategySubTab({ strategies, onRefresh }: { strategies: InvestmentStrategy[]; onRefresh: () => void }) {
  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch('/api/investment/strategies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    onRefresh()
  }

  const deleteStrategy = async (id: string) => {
    if (!confirm('이 전략을 삭제하시겠습니까?')) return
    const res = await fetch(`/api/investment/strategies?id=${id}`, { method: 'DELETE' })
    if (res.ok) onRefresh()
    else { const json = await res.json(); alert(json.error) }
  }

  const MARKET_LABELS: Record<string, string> = { KR: '국내', US: '미국' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-at-text">전략 관리</h2>
          <p className="text-sm text-at-text-secondary mt-1">매매 전략을 생성하고 백테스트하세요</p>
        </div>
        <Link
          href="/investment/strategy/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> 새 전략
        </Link>
      </div>

      {strategies.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm border border-at-border p-8">
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <Target className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">아직 생성된 전략이 없습니다</p>
            <p className="text-xs mt-1">새 전략을 만들어 백테스트해보세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-at-text">{s.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      s.is_active
                        ? 'bg-green-50 text-at-success border border-green-200'
                        : 'bg-at-surface-alt text-at-text-weak border border-at-border'
                    }`}>{s.is_active ? '활성' : '비활성'}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-at-accent-light text-at-accent font-medium">
                      {MARKET_LABELS[s.target_market] || s.target_market}
                    </span>
                  </div>
                  {s.description && <p className="text-xs text-at-text-secondary mt-1">{s.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-at-text-weak">
                    <span>지표 {(s.indicators as unknown[]).length}개</span>
                    <span>Level {s.automation_level}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/investment/strategy/${s.id}/backtest`} className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors text-at-text-secondary" title="백테스트">
                    <BarChart3 className="w-4 h-4" />
                  </Link>
                  <button onClick={() => toggleActive(s.id, s.is_active)} className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors text-at-text-secondary" title={s.is_active ? '비활성화' : '활성화'}>
                    {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => deleteStrategy(s.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors text-at-error/60 hover:text-at-error" title="삭제" disabled={s.is_active}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, unit, icon: Icon }: { title: string; value: string; unit: string; icon: React.ElementType }) {
  return (
    <div className="bg-at-surface-alt rounded-2xl p-4 border border-at-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-at-text-secondary font-medium">{title}</span>
        <Icon className="w-4 h-4 text-at-text-weak" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-at-text">{value}</span>
        <span className="text-xs text-at-text-weak">{unit}</span>
      </div>
    </div>
  )
}
