'use client'

import type { RiskSettings } from '@/types/investment'

interface Props {
  riskSettings: RiskSettings
  onChange: (settings: RiskSettings) => void
}

interface FieldConfig {
  key: keyof RiskSettings
  label: string
  description: string
  recommended: string  // 투자 일반론 권장 범위
  unit: string
  min: number
  max: number
  step: number
}

const FIELDS: FieldConfig[] = [
  {
    key: 'stopLossPercent',
    label: '손절 기준',
    description: '매입가 대비 하락 시 자동 매도',
    recommended: '권장: 5~8% (단기 스윙), 10~15% (중기)',
    unit: '%',
    min: 0,
    max: 50,
    step: 0.5,
  },
  {
    key: 'takeProfitPercent',
    label: '익절 기준',
    description: '매입가 대비 상승 시 자동 매도',
    recommended: '권장: 손절의 2~3배 (리스크-보상 비율 1:2 이상)',
    unit: '%',
    min: 0,
    max: 100,
    step: 0.5,
  },
  {
    key: 'maxDailyLossPercent',
    label: '일일 최대 손실',
    description: '하루 누적 손실이 이 수치를 넘으면 당일 매매 중지',
    recommended: '권장: 2~3% (전체 자금 보호)',
    unit: '%',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    key: 'maxPositionSizePercent',
    label: '종목당 최대 비중',
    description: '포트폴리오 대비 한 종목에 투자할 최대 비율',
    recommended: '권장: 20~25% (4~5종목 분산), 보수적: 10~15%',
    unit: '%',
    min: 5,
    max: 100,
    step: 5,
  },
  {
    key: 'maxPositions',
    label: '최대 보유 종목 수',
    description: '동시에 보유할 수 있는 최대 종목 수',
    recommended: '권장: 5~7개 (과도한 분산은 관리 어려움)',
    unit: '개',
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: 'maxHoldingDays',
    label: '최대 보유 기간',
    description: '이 기간이 지나면 자동 매도 (0 = 무제한)',
    recommended: '권장: 단기 10~20일, 중기 30~60일, 무제한 0',
    unit: '일',
    min: 0,
    max: 365,
    step: 1,
  },
]

export default function RiskSettingsPanel({ riskSettings, onChange }: Props) {
  const update = (key: keyof RiskSettings, value: number) => {
    onChange({ ...riskSettings, [key]: value })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
      <h2 className="font-semibold text-at-text mb-1">리스크 관리</h2>
      <p className="text-xs text-at-text-secondary mb-3">손실을 제한하고 포트폴리오를 보호하세요</p>

      {/* 투자 일반론 가이드 */}
      <div className="mb-5 p-3 rounded-xl bg-at-accent-light border border-at-accent/20">
        <p className="text-xs font-semibold text-at-accent mb-1.5">📘 투자 일반론 가이드</p>
        <ul className="text-[11px] text-at-text-secondary space-y-0.5 leading-relaxed">
          <li>• <strong>2% Rule</strong>: 한 거래의 손실은 전체 자금의 1~2%로 제한 (Van Tharp)</li>
          <li>• <strong>리스크-보상 비율</strong>: 익절 ≥ 손절 × 2 (기대값 양수 유지)</li>
          <li>• <strong>분산 투자</strong>: 5~7종목 보유, 종목당 최대 20~25%</li>
          <li>• <strong>일일 손실 한도</strong>: 2~3% 도달 시 당일 매매 중단 (감정 매매 방지)</li>
        </ul>
      </div>

      <div className="space-y-6">
        {FIELDS.map(field => {
          const value = riskSettings[field.key]
          const percent = ((value - field.min) / (field.max - field.min)) * 100
          return (
            <div key={field.key}>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-sm font-medium text-at-text">{field.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={value}
                    onChange={e => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v)) update(field.key, Math.max(field.min, Math.min(field.max, v)))
                    }}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    className="w-20 px-2 py-1 rounded-lg border border-at-border bg-white text-at-text text-sm font-mono text-right focus:outline-none focus:border-at-accent"
                  />
                  <span className="text-xs text-at-text-secondary">{field.unit}</span>
                </div>
              </div>
              <p className="text-xs text-at-text-secondary mb-1">{field.description}</p>
              <p className="text-[11px] text-at-accent mb-3">💡 {field.recommended}</p>

              {/* 커스텀 슬라이더 트랙 + 네이티브 input range 오버레이 */}
              <div className="relative h-6 flex items-center">
                {/* 배경 트랙 */}
                <div className="absolute inset-x-0 h-2 bg-at-surface-alt rounded-full border border-at-border" />
                {/* 채워진 영역 */}
                <div
                  className="absolute h-2 bg-at-accent rounded-full"
                  style={{ width: `${percent}%` }}
                />
                {/* Thumb (시각용, pointer-events-none) */}
                <div
                  className="absolute w-5 h-5 bg-white border-[3px] border-at-accent rounded-full shadow-sm pointer-events-none"
                  style={{ left: `calc(${percent}% - 10px)` }}
                />
                {/* 실제 인터랙션용 네이티브 range */}
                <input
                  type="range"
                  value={value}
                  onChange={e => update(field.key, Number(e.target.value))}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  className="relative w-full h-6 appearance-none bg-transparent cursor-pointer z-10 opacity-0"
                  aria-label={field.label}
                />
              </div>

              <div className="flex justify-between text-[10px] text-at-text-weak mt-1">
                <span>{field.min}{field.unit}</span>
                <span>{field.max}{field.unit}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
