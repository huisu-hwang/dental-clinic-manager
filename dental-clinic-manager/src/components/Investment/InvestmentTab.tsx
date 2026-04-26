'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Link2, Target, TrendingUp, TrendingDown, Briefcase,
  Wallet, Activity, AlertCircle, OctagonX, Loader2,
  ArrowRight, Plus, Play, Pause, Trash2, BarChart3,
  Zap, GitCompare, Search,
} from 'lucide-react'
import ConnectContent from './ConnectContent'
import TradingContent from './TradingContent'
import BacktestPanel from './BacktestPanel'
import StrategyCard from './StrategyCard'
import DayTradingContent from './DayTradingContent'
import CompareContent from './CompareContent'
import ScreenerContent from './ScreenerContent'
import StrategyBuilder from './StrategyBuilder/StrategyBuilder'
import type { InvestmentStrategy } from '@/types/investment'

type SubTab = 'dashboard' | 'connect' | 'strategy' | 'daytrading' | 'compare' | 'screener' | 'trading' | 'portfolio'

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'connect', label: '계좌 연결', icon: Link2 },
  { id: 'strategy', label: '전략 관리', icon: Target },
  { id: 'daytrading', label: '단타 (분봉)', icon: Zap },
  { id: 'compare', label: '전략 비교', icon: GitCompare },
  { id: 'screener', label: '종목 스크리너', icon: Search },
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
  const [backtestStrategyId, setBacktestStrategyId] = useState<string | null>(null)
  const [creatingStrategy, setCreatingStrategy] = useState(false)
  const [balance, setBalance] = useState<{ totalEvaluation: number; totalPnl: number; holdingsCount: number } | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true)
    setBalanceError(null)
    try {
      const res = await fetch('/api/investment/balance')
      const json = await res.json()
      if (res.ok && json.success && json.data) {
        setBalance({
          totalEvaluation: json.data.totalEvaluation || 0,
          totalPnl: json.data.totalPnl || 0,
          holdingsCount: (json.data.items || []).length,
        })
      } else {
        setBalance(null)
        if (res.status !== 404) setBalanceError(json.error || '잔고 조회 실패')
      }
    } catch {
      setBalance(null)
      setBalanceError('네트워크 오류')
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('user_broker_credentials')
        .select('id, is_paper_trading')
        .eq('is_active', true)
        .maybeSingle()
      const connected = !!data
      setHasCredential(connected)

      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (json.data) setStrategies(json.data)

      // 계좌 연결된 경우 잔고도 로드
      if (connected) {
        loadBalance()
      }
    } catch {
      setHasCredential(false)
    } finally {
      setLoading(false)
    }
  }, [loadBalance])

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

  // 인라인 뷰 모드 (백테스트 또는 새 전략 만들기)
  const inInlineView = backtestStrategyId !== null || creatingStrategy

  const handleTabChange = (id: SubTab) => {
    // 다른 탭 클릭 시 인라인 모드 자동 종료
    if (inInlineView) {
      setBacktestStrategyId(null)
      setCreatingStrategy(false)
    }
    setSubTab(id)
  }

  return (
    <div className="bg-white min-h-screen">
      {/* 서브메뉴 탭 - 항상 표시 (인라인 뷰에서도) */}
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {SUB_TABS.map(tab => {
            const Icon = tab.icon
            // 인라인 뷰에서는 어느 탭도 active 표시 안 함 (모드를 명확히 구분)
            const isActive = !inInlineView && subTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
                  isActive
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
        {/* 인라인 뷰 우선 (백테스트 / 새 전략) */}
        {backtestStrategyId && (
          <BacktestPanel
            strategyId={backtestStrategyId}
            onBack={() => setBacktestStrategyId(null)}
          />
        )}
        {creatingStrategy && (
          <StrategyBuilder
            onCancel={() => setCreatingStrategy(false)}
            onSaved={() => { setCreatingStrategy(false); loadData() }}
          />
        )}

        {/* 일반 탭 콘텐츠 (인라인 뷰가 아닐 때만) */}
        {!inInlineView && subTab === 'dashboard' && (
          <DashboardSubTab
            hasCredential={hasCredential}
            strategies={strategies}
            activeStrategies={activeStrategies}
            emergencyStopping={emergencyStopping}
            onEmergencyStop={handleEmergencyStop}
            onNavigate={setSubTab}
            balance={balance}
            balanceLoading={balanceLoading}
            balanceError={balanceError}
            onRefreshBalance={loadBalance}
            onRefresh={loadData}
          />
        )}
        {!inInlineView && subTab === 'connect' && (
          <ConnectContent onCredentialChange={loadData} />
        )}
        {!inInlineView && subTab === 'strategy' && (
          <StrategySubTab
            strategies={strategies}
            onRefresh={loadData}
            onBacktest={setBacktestStrategyId}
            hasCredential={!!hasCredential}
            onCreateNew={() => setCreatingStrategy(true)}
          />
        )}
        {!inInlineView && subTab === 'daytrading' && (
          <DayTradingContent />
        )}
        {!inInlineView && subTab === 'compare' && (
          <CompareContent />
        )}
        {!inInlineView && subTab === 'screener' && (
          <ScreenerContent />
        )}
        {!inInlineView && subTab === 'trading' && (
          <TradingContent />
        )}
        {!inInlineView && subTab === 'portfolio' && (
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

function DashboardSubTab({ hasCredential, strategies, activeStrategies, emergencyStopping, onEmergencyStop, onNavigate, balance, balanceLoading, balanceError, onRefreshBalance, onRefresh }: {
  hasCredential: boolean | null
  strategies: InvestmentStrategy[]
  activeStrategies: InvestmentStrategy[]
  emergencyStopping: boolean
  onEmergencyStop: () => void
  onNavigate: (tab: SubTab) => void
  balance: { totalEvaluation: number; totalPnl: number; holdingsCount: number } | null
  balanceLoading: boolean
  balanceError: string | null
  onRefreshBalance: () => void
  onRefresh: () => void
}) {
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const toggleActive = async (s: InvestmentStrategy) => {
    setTogglingId(s.id)
    try {
      const res = await fetch('/api/investment/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, isActive: !s.is_active }),
      })
      const json = await res.json()
      if (res.ok) {
        onRefresh()
      } else {
        if (json.code === 'NO_WATCHLIST') {
          alert('⚠️ 감시 종목이 없습니다.\n\n전략 관리 탭에서 자동매매할 종목을 먼저 추가해주세요.')
        } else if (json.code === 'NO_CREDENTIAL') {
          alert('⚠️ 증권 계좌 연결이 필요합니다.\n\n계좌 연결 탭에서 KIS 계좌를 먼저 연결해주세요.')
        } else {
          alert(json.error || '전환 실패')
        }
      }
    } catch { alert('네트워크 오류') } finally { setTogglingId(null) }
  }
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

  const formatCurrency = (n: number) => {
    if (!Number.isFinite(n)) return '--'
    return Math.round(n).toLocaleString('ko-KR')
  }
  const totalEvalDisplay = balanceLoading ? '...' : (balance ? formatCurrency(balance.totalEvaluation) : '--')
  const totalPnlDisplay = balanceLoading ? '...' : (balance ? formatCurrency(balance.totalPnl) : '--')
  const pnlPositive = balance ? balance.totalPnl >= 0 : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-at-text">투자 대시보드</h2>
          <p className="text-sm text-at-text-secondary mt-1">포트폴리오 현황과 활성 전략을 확인하세요</p>
        </div>
        {hasCredential && (
          <button
            onClick={onRefreshBalance}
            disabled={balanceLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-at-text-secondary hover:bg-at-surface-alt transition-colors disabled:opacity-50"
            title="잔고 새로고침"
          >
            <Loader2 className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`} />
            잔고 새로고침
          </button>
        )}
      </div>

      {balanceError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          잔고 조회 실패: {balanceError}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="총 평가금액" value={totalEvalDisplay} unit="원" icon={Wallet} />
        <SummaryCard
          title="총 손익"
          value={pnlPositive === null ? totalPnlDisplay : `${balance!.totalPnl >= 0 ? '+' : ''}${totalPnlDisplay}`}
          unit="원"
          icon={pnlPositive === false ? TrendingDown : TrendingUp}
          valueColor={pnlPositive === true ? 'text-red-500' : pnlPositive === false ? 'text-blue-500' : undefined}
        />
        <SummaryCard title="보유 종목" value={balance ? String(balance.holdingsCount) : '--'} unit="개" icon={Briefcase} />
        <SummaryCard title="활성 전략" value={String(activeStrategies.length)} unit="개" icon={Target} />
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

      {/* 자동매매 시작 가이드 (활성 전략 없을 때만) */}
      {activeStrategies.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <h3 className="font-semibold text-at-text mb-3">🚀 자동매매 시작하기</h3>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-at-accent-light text-at-accent text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <button onClick={() => onNavigate('connect')} className="text-at-accent font-medium hover:underline">계좌 연결</button>
                <span className="text-at-text-secondary"> - KIS 증권 계좌를 연결 (모의투자부터 권장)</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-at-accent-light text-at-accent text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <button onClick={() => onNavigate('strategy')} className="text-at-accent font-medium hover:underline">전략 만들기</button>
                <span className="text-at-text-secondary"> - 지표/조건/리스크 설정 (프리셋 활용 가능)</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-at-accent-light text-at-accent text-xs font-bold flex items-center justify-center">3</span>
              <div>
                <span className="text-at-text font-medium">감시 종목 추가</span>
                <span className="text-at-text-secondary"> - 전략 카드를 펼쳐서 자동매매할 종목 추가</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-at-accent-light text-at-accent text-xs font-bold flex items-center justify-center">4</span>
              <div>
                <span className="text-at-text font-medium">백테스트</span>
                <span className="text-at-text-secondary"> - 과거 데이터로 전략의 성과 검증</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">5</span>
              <div>
                <span className="text-at-text font-medium">▶ 자동매매 시작</span>
                <span className="text-at-text-secondary"> - 전략 카드의 [▶] 버튼으로 활성화</span>
              </div>
            </li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 전략 목록 (활성/비활성 모두) */}
        <div className="bg-white rounded-3xl shadow-sm border border-at-border overflow-hidden">
          <div className="px-6 py-4 border-b border-at-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-at-text">내 전략</h3>
              <p className="text-xs text-at-text-secondary mt-0.5">
                클릭하여 자동매매 활성/비활성 전환
              </p>
            </div>
            <button onClick={() => onNavigate('strategy')} className="text-xs text-at-accent hover:underline">
              전략 관리 →
            </button>
          </div>
          <div className="p-6">
            {strategies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                <Target className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">아직 생성된 전략이 없습니다</p>
                <button onClick={() => onNavigate('strategy')} className="mt-3 text-sm text-at-accent hover:underline">
                  전략 만들기 →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {strategies.map(s => {
                  const isToggling = togglingId === s.id
                  return (
                    <div key={s.id} className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                      s.is_active
                        ? 'bg-green-50/40 border-green-200'
                        : 'bg-at-surface-alt border-at-border'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-at-text truncate">{s.name}</p>
                        <p className="text-xs text-at-text-secondary mt-0.5">
                          {s.target_market === 'KR' ? '국내' : '미국'} · {s.timeframe} · Level {s.automation_level}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleActive(s)}
                        disabled={isToggling}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                          s.is_active
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-white text-at-text-secondary border border-at-border hover:bg-at-accent hover:text-white hover:border-at-accent'
                        }`}
                        title={s.is_active ? '자동매매 중지' : '자동매매 시작'}
                      >
                        {isToggling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : s.is_active ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>활성</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>비활성</span>
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
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

function StrategySubTab({ strategies, onRefresh, onBacktest, hasCredential, onCreateNew }: { strategies: InvestmentStrategy[]; onRefresh: () => void; onBacktest: (id: string) => void; hasCredential: boolean; onCreateNew: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-at-text">전략 관리</h2>
          <p className="text-sm text-at-text-secondary mt-1">매매 전략을 생성하고 백테스트하세요</p>
        </div>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> 새 전략
        </button>
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
            <StrategyCard
              key={s.id}
              strategy={s}
              hasCredential={hasCredential}
              onRefresh={onRefresh}
              onBacktest={onBacktest}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, unit, icon: Icon, valueColor }: { title: string; value: string; unit: string; icon: React.ElementType; valueColor?: string }) {
  return (
    <div className="bg-at-surface-alt rounded-2xl p-4 border border-at-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-at-text-secondary font-medium">{title}</span>
        <Icon className="w-4 h-4 text-at-text-weak" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold ${valueColor || 'text-at-text'}`}>{value}</span>
        <span className="text-xs text-at-text-weak">{unit}</span>
      </div>
    </div>
  )
}
