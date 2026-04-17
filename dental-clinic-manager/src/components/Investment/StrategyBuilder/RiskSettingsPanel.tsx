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
    unit: '%',
    min: 0,
    max: 50,
    step: 0.5,
  },
  {
    key: 'takeProfitPercent',
    label: '익절 기준',
    description: '매입가 대비 상승 시 자동 매도',
    unit: '%',
    min: 0,
    max: 100,
    step: 0.5,
  },
  {
    key: 'maxDailyLossPercent',
    label: '일일 최대 손실',
    description: '하루 누적 손실이 이 수치를 넘으면 당일 매매 중지',
    unit: '%',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    key: 'maxPositionSizePercent',
    label: '종목당 최대 비중',
    description: '포트폴리오 대비 한 종목에 투자할 최대 비율',
    unit: '%',
    min: 5,
    max: 100,
    step: 5,
  },
  {
    key: 'maxPositions',
    label: '최대 보유 종목 수',
    description: '동시에 보유할 수 있는 최대 종목 수',
    unit: '개',
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: 'maxHoldingDays',
    label: '최대 보유 기간',
    description: '이 기간이 지나면 자동 매도 (0 = 무제한)',
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
      <p className="text-xs text-at-text-secondary mb-4">손실을 제한하고 포트폴리오를 보호하세요</p>

      <div className="space-y-5">
        {FIELDS.map(field => (
          <div key={field.key}>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-sm font-medium text-at-text">{field.label}</label>
              <span className="text-sm font-mono text-at-accent font-semibold">
                {riskSettings[field.key]}{field.unit}
              </span>
            </div>
            <p className="text-xs text-at-text-secondary mb-2">{field.description}</p>
            <input
              type="range"
              value={riskSettings[field.key]}
              onChange={e => update(field.key, Number(e.target.value))}
              min={field.min}
              max={field.max}
              step={field.step}
              className="w-full h-1.5 bg-at-bg rounded-full appearance-none cursor-pointer accent-at-accent"
            />
            <div className="flex justify-between text-[10px] text-at-text-weak mt-0.5">
              <span>{field.min}{field.unit}</span>
              <span>{field.max}{field.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
