'use client'

import { useMemo } from 'react'
import type { PeriodWindow, MarketFilter } from './types'

interface Props {
  market: MarketFilter
  onMarketChange: (m: MarketFilter) => void
  periodWindow: PeriodWindow
  onPeriodChange: (w: PeriodWindow) => void
  selectedStrategies: string[]
  onStrategiesChange: (ids: string[]) => void
  availableStrategies: Array<{ id: string; name: string; type: 'preset' | 'shared' }>
  tickersText: string
  onTickersChange: (v: string) => void
  loading?: boolean
}

const MARKETS: Array<{ value: MarketFilter; label: string; desc: string }> = [
  { value: 'ALL', label: '전체', desc: 'KR + US 통합' },
  { value: 'KR', label: 'KR만', desc: '국내 종목' },
  { value: 'US', label: 'US만', desc: '미국 종목' },
  { value: 'SPLIT', label: 'KR/US 분할비교', desc: '시장별 좌우 비교' },
]

const WINDOWS: PeriodWindow[] = ['1Y', '3Y', '5Y', '10Y']

export default function MatrixFilters(props: Props) {
  const {
    market, onMarketChange,
    periodWindow, onPeriodChange,
    selectedStrategies, onStrategiesChange,
    availableStrategies,
    tickersText, onTickersChange,
    loading,
  } = props

  const presets = useMemo(() => availableStrategies.filter(s => s.type === 'preset'), [availableStrategies])
  const shared = useMemo(() => availableStrategies.filter(s => s.type === 'shared'), [availableStrategies])

  const toggleStrategy = (id: string) => {
    if (selectedStrategies.includes(id)) {
      onStrategiesChange(selectedStrategies.filter(s => s !== id))
    } else {
      onStrategiesChange([...selectedStrategies, id])
    }
  }

  const selectAll = () => onStrategiesChange(availableStrategies.map(s => s.id))
  const clearAll = () => onStrategiesChange([])

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* 시장 토글 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">시장</div>
        <div className="flex flex-wrap gap-2">
          {MARKETS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => onMarketChange(m.value)}
              disabled={loading}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                market === m.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기간 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">기간 (Window)</div>
        <div className="flex gap-2">
          {WINDOWS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => onPeriodChange(w)}
              disabled={loading}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                periodWindow === w
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 종목 필터 (콤마구분 입력) */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">
          종목 필터 <span className="text-xs text-gray-400">(콤마구분, 비워두면 전체)</span>
        </div>
        <input
          type="text"
          value={tickersText}
          onChange={e => onTickersChange(e.target.value)}
          placeholder="예: 005930, AAPL, TSLA"
          disabled={loading}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 전략 다중 선택 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">
            전략 선택{' '}
            <span className="text-xs text-gray-400">
              ({selectedStrategies.length} / {availableStrategies.length})
            </span>
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">전체</button>
            <button type="button" onClick={clearAll} className="text-gray-500 hover:underline">해제</button>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-2">
          {presets.length > 0 && (
            <>
              <div className="mb-1 text-xs font-semibold text-gray-500">프리셋</div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {presets.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStrategy(s.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selectedStrategies.includes(s.id)
                        ? 'border-blue-500 bg-blue-100 text-blue-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {shared.length > 0 && (
            <>
              <div className="mb-1 text-xs font-semibold text-gray-500">공유 사용자 전략</div>
              <div className="flex flex-wrap gap-1.5">
                {shared.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStrategy(s.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selectedStrategies.includes(s.id)
                        ? 'border-purple-500 bg-purple-100 text-purple-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
