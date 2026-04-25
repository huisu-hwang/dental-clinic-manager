'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Sparkles, Settings2, Zap, AlertCircle } from 'lucide-react'
import IndicatorPanel from '@/components/Investment/StrategyBuilder/IndicatorPanel'
import ConditionBuilder from '@/components/Investment/StrategyBuilder/ConditionBuilder'
import type {
  InvestmentStrategy,
  Market, Timeframe, AutomationLevel,
  IndicatorConfig, ConditionGroup,
} from '@/types/investment'

type Step = 'basic' | 'indicators' | 'conditions'

const EMPTY_GROUP: ConditionGroup = { type: 'group', operator: 'AND', conditions: [] }

export default function EditStrategyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const strategyId = params?.id

  const [step, setStep] = useState<Step>('basic')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)

  // 폼 상태
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [market, setMarket] = useState<Market>('KR')
  const [timeframe, setTimeframe] = useState<Timeframe>('1d')
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>(1)
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([])
  const [buyConditions, setBuyConditions] = useState<ConditionGroup>(EMPTY_GROUP)
  const [sellConditions, setSellConditions] = useState<ConditionGroup>(EMPTY_GROUP)

  // 기존 전략 로드
  useEffect(() => {
    if (!strategyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/investment/strategies')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '전략 조회 실패')
        const list: InvestmentStrategy[] = json.data || []
        const found = list.find(s => s.id === strategyId)
        if (!found) throw new Error('전략을 찾을 수 없습니다')
        if (cancelled) return
        setName(found.name || '')
        setDescription(found.description || '')
        setMarket(found.target_market)
        setTimeframe(found.timeframe)
        setAutomationLevel(found.automation_level)
        setIndicators(found.indicators || [])
        setBuyConditions(found.buy_conditions || EMPTY_GROUP)
        setSellConditions(found.sell_conditions || EMPTY_GROUP)
        setIsActive(!!found.is_active)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [strategyId])

  const handleSave = async () => {
    if (!name.trim()) {
      alert('전략 이름을 입력해주세요')
      return
    }
    if (!strategyId) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        id: strategyId,
        name: name.trim(),
        description: description.trim() || null,
        automationLevel,
      }
      // 비활성 전략일 때만 불변 필드 전송 (활성 전략에서는 API가 거부)
      if (!isActive) {
        payload.targetMarket = market
        payload.timeframe = timeframe
        payload.indicators = indicators
        payload.buyConditions = buyConditions
        payload.sellConditions = sellConditions
      }

      const res = await fetch('/api/investment/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.ok) {
        router.push('/investment/strategy')
      } else {
        alert(json.error || '저장 실패')
      }
    } catch {
      alert('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: 'basic', label: '기본 설정', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'indicators', label: '지표 선택', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'conditions', label: '매매 조건', icon: <Zap className="w-4 h-4" /> },
  ]
  const currentIndex = steps.findIndex(s => s.id === step)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/investment/strategy" className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors">
            <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
          </Link>
          <h1 className="text-xl font-bold text-at-text">전략 수정</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/investment/strategy" className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors">
            <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
          </Link>
          <h1 className="text-xl font-bold text-at-text">전략 수정</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8 text-center">
          <AlertCircle className="w-10 h-10 text-at-error mx-auto mb-3" />
          <p className="text-sm text-at-text">{error}</p>
          <Link
            href="/investment/strategy"
            className="inline-block mt-4 px-4 py-2 rounded-xl bg-at-surface-alt text-at-text-secondary text-sm hover:bg-at-border transition-colors"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/investment/strategy" className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors">
          <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-at-text">전략 수정</h1>
          <p className="text-sm text-at-text-secondary mt-0.5">기존 전략의 설정을 변경합니다</p>
        </div>
      </div>

      {/* 활성 전략 경고 */}
      {isActive && (
        <div className="flex items-start gap-3 bg-at-warning-bg border border-at-warning/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-at-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-at-warning">활성 중인 전략입니다</p>
            <p className="text-at-text-secondary mt-1">
              이름/설명/자동화 수준만 수정할 수 있습니다. 시장·시간프레임·지표·매매 조건을 바꾸려면 먼저 목록 페이지에서 전략을 비활성화해주세요.
            </p>
          </div>
        </div>
      )}

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                s.id === step
                  ? 'bg-at-accent text-white'
                  : i < currentIndex
                    ? 'bg-at-accent-light text-at-accent'
                    : 'bg-at-bg text-at-text-weak'
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-at-text-weak mx-1" />}
          </div>
        ))}
      </div>

      {/* 스텝별 콘텐츠 */}
      {step === 'basic' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5 space-y-4">
            <h2 className="font-semibold text-at-text">기본 설정</h2>
            <div>
              <label className="block text-sm text-at-text-secondary mb-1">전략 이름 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: RSI 과매도 반등"
                className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm text-at-text-secondary mb-1">설명</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="전략에 대한 간단한 설명"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-at-text-secondary mb-1">시장</label>
                <select
                  value={market}
                  onChange={e => setMarket(e.target.value as Market)}
                  disabled={isActive}
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="KR">국내 (KOSPI/KOSDAQ)</option>
                  <option value="US">미국 (NYSE/NASDAQ)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-at-text-secondary mb-1">시간 프레임</label>
                <select
                  value={timeframe}
                  onChange={e => setTimeframe(e.target.value as Timeframe)}
                  disabled={isActive}
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="1d">일봉</option>
                  <option value="1h">1시간봉</option>
                  <option value="15m">15분봉</option>
                  <option value="5m">5분봉</option>
                  <option value="1w">주봉</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-at-text-secondary mb-1">자동화 수준</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAutomationLevel(1)}
                  className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${
                    automationLevel === 1
                      ? 'border-at-accent bg-at-accent-light/30'
                      : 'border-at-border hover:border-at-accent/50'
                  }`}
                >
                  <p className="font-medium text-at-text">Level 1: 알림만</p>
                  <p className="text-xs text-at-text-secondary mt-0.5">신호 발생 시 Telegram 알림</p>
                </button>
                <button
                  onClick={() => setAutomationLevel(2)}
                  className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${
                    automationLevel === 2
                      ? 'border-at-accent bg-at-accent-light/30'
                      : 'border-at-border hover:border-at-accent/50'
                  }`}
                >
                  <p className="font-medium text-at-text">Level 2: 완전 자동</p>
                  <p className="text-xs text-at-text-secondary mt-0.5">자동 주문 + 결과 보고</p>
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => setStep('indicators')}
            className="w-full py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors"
          >
            다음: 지표 선택
          </button>
        </div>
      )}

      {step === 'indicators' && (
        <div className="space-y-4">
          {isActive && (
            <div className="text-xs text-at-text-secondary bg-at-surface-alt rounded-lg px-3 py-2">
              활성 전략에서는 지표를 수정할 수 없습니다 (읽기 전용).
            </div>
          )}
          <div className={isActive ? 'pointer-events-none opacity-60' : ''}>
            <IndicatorPanel indicators={indicators} onChange={setIndicators} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('basic')}
              className="flex-1 py-3 border border-at-border text-at-text rounded-xl font-medium hover:bg-at-surface-alt transition-colors"
            >
              이전
            </button>
            <button
              onClick={() => setStep('conditions')}
              className="flex-1 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors"
            >
              다음: 매매 조건
            </button>
          </div>
        </div>
      )}

      {step === 'conditions' && (
        <div className="space-y-4">
          {isActive && (
            <div className="text-xs text-at-text-secondary bg-at-surface-alt rounded-lg px-3 py-2">
              활성 전략에서는 매매 조건을 수정할 수 없습니다 (읽기 전용).
            </div>
          )}
          <div className={isActive ? 'pointer-events-none opacity-60' : ''}>
            <ConditionBuilder
              label="매수 조건"
              conditions={buyConditions}
              onChange={setBuyConditions}
              indicators={indicators}
            />
            <div className="h-4" />
            <ConditionBuilder
              label="매도 조건"
              conditions={sellConditions}
              onChange={setSellConditions}
              indicators={indicators}
            />
          </div>
          <div className="bg-at-accent-light/40 border border-at-accent/30 rounded-xl p-4 text-xs text-at-text-secondary">
            손절·일일 손실 제한 등 안전 장치는 <span className="font-semibold text-at-accent">자동매매 &gt; 자동매매 설정</span>에서 한 번만 설정하면 모든 전략에 동일하게 적용됩니다.
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('indicators')}
              className="flex-1 py-3 border border-at-border text-at-text rounded-xl font-medium hover:bg-at-surface-alt transition-colors"
            >
              이전
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '저장 중...' : '변경 사항 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
