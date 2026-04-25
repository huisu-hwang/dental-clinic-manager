'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import type { IndicatorConfig, IndicatorType } from '@/types/investment'

interface Props {
  indicators: IndicatorConfig[]
  onChange: (indicators: IndicatorConfig[]) => void
}

interface IndicatorTemplate {
  type: IndicatorType
  label: string
  description: string
  defaultParams: Record<string, number>
  paramLabels: Record<string, string>
}

const TEMPLATES: IndicatorTemplate[] = [
  {
    type: 'RSI',
    label: 'RSI (상대강도지수)',
    description: '과매수/과매도 구간 판단',
    defaultParams: { period: 14 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'SMA',
    label: 'SMA (단순이동평균)',
    description: '추세 방향 판단',
    defaultParams: { period: 20 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'EMA',
    label: 'EMA (지수이동평균)',
    description: '최근 가격에 가중치를 둔 이동평균',
    defaultParams: { period: 20 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'MACD',
    label: 'MACD',
    description: '추세 전환 신호',
    defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    paramLabels: { fastPeriod: '단기', slowPeriod: '장기', signalPeriod: '시그널' },
  },
  {
    type: 'BB',
    label: '볼린저 밴드',
    description: '변동성 기반 상하한 밴드',
    defaultParams: { period: 20, stdDev: 2 },
    paramLabels: { period: '기간', stdDev: '표준편차' },
  },
  {
    type: 'STOCH',
    label: '스토캐스틱',
    description: '%K, %D 기반 과매수/과매도',
    defaultParams: { period: 14, signalPeriod: 3 },
    paramLabels: { period: '기간', signalPeriod: '시그널' },
  },
  {
    type: 'ATR',
    label: 'ATR (평균진폭)',
    description: '변동성 크기 측정',
    defaultParams: { period: 14 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'ADX',
    label: 'ADX (추세강도)',
    description: '추세의 강도 판단',
    defaultParams: { period: 14 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'CCI',
    label: 'CCI (상품채널지수)',
    description: '가격 편차 기반 과매수/과매도',
    defaultParams: { period: 20 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'WILLR',
    label: 'Williams %R',
    description: '고가 대비 현재가 위치',
    defaultParams: { period: 14 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'VOLUME_SMA',
    label: '거래량 이동평균',
    description: '거래량 추세 분석',
    defaultParams: { period: 20 },
    paramLabels: { period: '기간' },
  },
  {
    type: 'FEAR_GREED',
    label: '😱 공포/탐욕 지수 (F&G)',
    description: '실시간 시장 심리를 0~100 점수로 합성 (RSI+BB+거래량+모멘텀)',
    defaultParams: { rsiPeriod: 14, bbPeriod: 20, volPeriod: 20, momentumPeriod: 10 },
    paramLabels: { rsiPeriod: 'RSI', bbPeriod: 'BB', volPeriod: '거래량', momentumPeriod: '모멘텀' },
  },
  {
    type: 'SMART_MONEY',
    label: '🐳 스마트머니 지수 (중기)',
    description: 'CMF+A/D 다이버전스+Wyckoff Spring/Upthrust로 매집/분산 추적 (-100~+100)',
    defaultParams: { cmfPeriod: 20, divergenceLookback: 20, springLookback: 10, upthrustLookback: 10 },
    paramLabels: { cmfPeriod: 'CMF', divergenceLookback: '다이버전스', springLookback: 'Spring', upthrustLookback: 'Upthrust' },
  },
  {
    type: 'DAILY_SMART_MONEY_PULSE',
    label: '⚡ 일일 스마트머니 펄스 (단타)',
    description: '당일 종가위치+거래량+갭 동작으로 일일 매집/분산 포착 (-100~+100)',
    defaultParams: { volPeriod: 20 },
    paramLabels: { volPeriod: '거래량 기간' },
  },
]

function generateId(type: IndicatorType, params: Record<string, number>): string {
  const paramStr = Object.values(params).join('_')
  return `${type}_${paramStr}`
}

export default function IndicatorPanel({ indicators, onChange }: Props) {
  const [showAdd, setShowAdd] = useState(false)

  const addIndicator = (template: IndicatorTemplate) => {
    if (indicators.length >= 8) {
      alert('지표는 최대 8개까지 추가 가능합니다')
      return
    }
    const id = generateId(template.type, template.defaultParams)
    // 중복 체크
    if (indicators.some(i => i.id === id)) {
      alert('이미 추가된 지표입니다')
      return
    }
    onChange([...indicators, { id, type: template.type, params: { ...template.defaultParams } }])
    setShowAdd(false)
  }

  const removeIndicator = (id: string) => {
    onChange(indicators.filter(i => i.id !== id))
  }

  const updateParam = (id: string, key: string, value: number) => {
    onChange(indicators.map(ind => {
      if (ind.id !== id) return ind
      const newParams = { ...ind.params, [key]: value }
      const newId = generateId(ind.type, newParams)
      return { ...ind, id: newId, params: newParams }
    }))
  }

  const getTemplate = (type: IndicatorType) => TEMPLATES.find(t => t.type === type)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-at-text">기술 지표</h2>
          <p className="text-xs text-at-text-secondary mt-0.5">{indicators.length}/8개 선택됨</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-at-accent-light text-at-accent rounded-lg hover:bg-at-accent hover:text-white transition-colors"
        >
          {showAdd ? <ChevronDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          지표 추가
        </button>
      </div>

      {/* 지표 추가 드롭다운 */}
      {showAdd && (
        <div className="mb-4 p-3 rounded-xl bg-at-bg border border-at-border max-h-60 overflow-y-auto">
          <div className="space-y-1">
            {TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => addIndicator(t)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-at-surface transition-colors"
              >
                <p className="text-sm font-medium text-at-text">{t.label}</p>
                <p className="text-xs text-at-text-secondary">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 추가된 지표 목록 */}
      {indicators.length === 0 ? (
        <p className="text-sm text-at-text-weak text-center py-4">
          지표를 추가해주세요
        </p>
      ) : (
        <div className="space-y-3">
          {indicators.map(ind => {
            const template = getTemplate(ind.type)
            return (
              <div key={ind.id} className="flex items-start gap-3 p-3 rounded-xl bg-at-bg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-at-text">
                      {template?.label || ind.type}
                    </span>
                    <span className="text-xs text-at-text-weak font-mono">{ind.id}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(ind.params).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1">
                        <label className="text-xs text-at-text-secondary">
                          {template?.paramLabels[key] || key}:
                        </label>
                        <input
                          type="number"
                          value={value}
                          onChange={e => updateParam(ind.id, key, Number(e.target.value) || 1)}
                          className="w-14 px-1.5 py-0.5 rounded border border-at-border bg-at-surface text-at-text text-xs text-center font-mono focus:outline-none focus:border-at-accent"
                          min={1}
                          max={200}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => removeIndicator(ind.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
