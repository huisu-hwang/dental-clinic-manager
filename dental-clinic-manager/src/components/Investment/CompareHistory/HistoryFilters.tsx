'use client'

import { Search } from 'lucide-react'

export type PeriodPreset = '7d' | '30d' | '90d' | 'all'

export interface HistoryFilterState {
  strategyId: string  // '' = 전체
  ticker: string
  preset: PeriodPreset
}

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  value: HistoryFilterState
  onChange: (next: HistoryFilterState) => void
  strategies: StrategyOption[]
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
  'all': '전체',
}

export default function HistoryFilters({ value, onChange, strategies }: Props) {
  const set = <K extends keyof HistoryFilterState>(key: K, v: HistoryFilterState[K]) => {
    onChange({ ...value, [key]: v })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white border border-at-border rounded-xl p-3">
      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">전략</span>
        <select
          value={value.strategyId}
          onChange={(e) => set('strategyId', e.target.value)}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
        >
          <option value="">전체</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.strategy_type !== 'rule' ? `(${s.strategy_type === 'rl_portfolio' ? 'RL' : 'RL단일'})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">종목</span>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-at-text-weak" aria-hidden="true" />
          <input
            type="text"
            value={value.ticker}
            onChange={(e) => set('ticker', e.target.value)}
            placeholder="AAPL, 005930…"
            className="w-full pl-9 pr-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">기간</span>
        <select
          value={value.preset}
          onChange={(e) => set('preset', e.target.value as PeriodPreset)}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
        >
          {(['7d', '30d', '90d', 'all'] as PeriodPreset[]).map((p) => (
            <option key={p} value={p}>{PRESET_LABELS[p]}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
