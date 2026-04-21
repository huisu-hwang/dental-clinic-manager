'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Sparkles, Settings2, Shield, Zap } from 'lucide-react'
import Link from 'next/link'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import IndicatorPanel from '@/components/Investment/StrategyBuilder/IndicatorPanel'
import ConditionBuilder from '@/components/Investment/StrategyBuilder/ConditionBuilder'
import RiskSettingsPanel from '@/components/Investment/StrategyBuilder/RiskSettingsPanel'
import type {
  Market, Timeframe, AutomationLevel,
  IndicatorConfig, ConditionGroup, RiskSettings, PresetStrategy,
} from '@/types/investment'

type Step = 'basic' | 'indicators' | 'conditions' | 'risk'

// 투자 일반론 기반 기본값 (2% Rule, 리스크-보상 1:2, 5종목 분산)
const DEFAULT_RISK: RiskSettings = {
  maxDailyLossPercent: 2,      // 2% Rule (Van Tharp): 일일 최대 손실 2%
  maxPositions: 5,              // 5종목 분산 (관리 가능 범위)
  maxPositionSizePercent: 20,   // 종목당 20% (5종목 × 20% = 100%)
  stopLossPercent: 7,           // 단기 스윙 기준 7%
  takeProfitPercent: 15,        // 리스크-보상 1:2 (7 × 2 ≈ 14~15)
  maxHoldingDays: 30,           // 중기 30일 보유 한도
}

const EMPTY_GROUP: ConditionGroup = { type: 'group', operator: 'AND', conditions: [] }

export default function NewStrategyPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('basic')
  const [saving, setSaving] = useState(false)

  // 폼 상태
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [market, setMarket] = useState<Market>('KR')
  const [timeframe, setTimeframe] = useState<Timeframe>('1d')
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>(1)
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([])
  const [buyConditions, setBuyConditions] = useState<ConditionGroup>(EMPTY_GROUP)
  const [sellConditions, setSellConditions] = useState<ConditionGroup>(EMPTY_GROUP)
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(DEFAULT_RISK)

  const applyPreset = (preset: PresetStrategy) => {
    setName(preset.name)
    setDescription(preset.description)
    setIndicators(preset.indicators)
    setBuyConditions(preset.buyConditions)
    setSellConditions(preset.sellConditions)
    setRiskSettings({ ...DEFAULT_RISK, ...preset.riskSettings })
    setStep('indicators')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('전략 이름을 입력해주세요')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/investment/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          targetMarket: market,
          timeframe,
          indicators,
          buyConditions,
          sellConditions,
          riskSettings,
          automationLevel,
        }),
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
    { id: 'risk', label: '리스크 관리', icon: <Shield className="w-4 h-4" /> },
  ]

  const currentIndex = steps.findIndex(s => s.id === step)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard?tab=investment" className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors">
          <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-at-text">새 전략 만들기</h1>
          <p className="text-sm text-at-text-secondary mt-0.5">프리셋으로 빠르게 시작하거나 직접 설정하세요</p>
        </div>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-2">
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
          {/* 프리셋 - 기본 전략 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
            <h2 className="font-semibold text-at-text mb-1">기본 전략</h2>
            <p className="text-xs text-at-text-secondary mb-3">검증된 클래식 기술적 분석 전략</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_STRATEGIES.filter(p => !['panic-buy', 'fomo-avoid', 'contrarian-extreme', 'bb-panic-bounce', 'fear-greed-index', 'fear-greed-conservative'].includes(p.id)).map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="text-left p-4 rounded-xl border border-at-border hover:border-at-accent hover:bg-at-accent-light/30 transition-all"
                >
                  <p className="font-medium text-sm text-at-text">{preset.name}</p>
                  <p className="text-xs text-at-text-secondary mt-1">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 프리셋 - 대중 심리 전략 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
            <h2 className="font-semibold text-at-text mb-1">🧠 대중 심리 전략</h2>
            <p className="text-xs text-at-text-secondary mb-3">공포/탐욕 극단 시점을 포착하는 역행(Contrarian) 투자 전략</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_STRATEGIES.filter(p => ['panic-buy', 'fomo-avoid', 'contrarian-extreme', 'bb-panic-bounce', 'fear-greed-index', 'fear-greed-conservative'].includes(p.id)).map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="text-left p-4 rounded-xl border border-at-border hover:border-purple-500 hover:bg-purple-50 transition-all"
                >
                  <p className="font-medium text-sm text-at-text">{preset.name}</p>
                  <p className="text-xs text-at-text-secondary mt-1">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 기본 설정 */}
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
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
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
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
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
          <IndicatorPanel indicators={indicators} onChange={setIndicators} />
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
          <ConditionBuilder
            label="매수 조건"
            conditions={buyConditions}
            onChange={setBuyConditions}
            indicators={indicators}
          />
          <ConditionBuilder
            label="매도 조건"
            conditions={sellConditions}
            onChange={setSellConditions}
            indicators={indicators}
          />
          <div className="flex gap-3">
            <button
              onClick={() => setStep('indicators')}
              className="flex-1 py-3 border border-at-border text-at-text rounded-xl font-medium hover:bg-at-surface-alt transition-colors"
            >
              이전
            </button>
            <button
              onClick={() => setStep('risk')}
              className="flex-1 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors"
            >
              다음: 리스크 관리
            </button>
          </div>
        </div>
      )}

      {step === 'risk' && (
        <div className="space-y-4">
          <RiskSettingsPanel riskSettings={riskSettings} onChange={setRiskSettings} />
          <div className="flex gap-3">
            <button
              onClick={() => setStep('conditions')}
              className="flex-1 py-3 border border-at-border text-at-text rounded-xl font-medium hover:bg-at-surface-alt transition-colors"
            >
              이전
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '저장 중...' : '전략 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
