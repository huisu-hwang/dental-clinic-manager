'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { History as HistoryIcon } from 'lucide-react'
import HistoryFilters, { type HistoryFilterState } from './HistoryFilters'
import HistoryTable from './HistoryTable'
import HistoryCompareView from './HistoryCompareView'

export interface BacktestRunRow {
  id: string
  strategy_id: string | null
  ticker: string
  market: 'KR' | 'US'
  start_date: string
  end_date: string
  initial_capital: number
  status: string
  total_return: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  total_trades: number | null
  win_rate: number | null
  equity_curve: Array<{ date: string; equity: number }> | null
  trades: Array<Record<string, unknown>> | null
  full_metrics: Record<string, unknown> | null
  executed_at: string
}

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FILTER: HistoryFilterState = {
  strategyId: '',     // '전체'
  ticker: '',
  preset: '30d',
}

function presetToSince(preset: HistoryFilterState['preset']): string | null {
  switch (preset) {
    case '7d': return daysAgo(7)
    case '30d': return daysAgo(30)
    case '90d': return daysAgo(90)
    case 'all': return null
    default: return null
  }
}

export default function HistoryTab() {
  const [filter, setFilter] = useState<HistoryFilterState>(DEFAULT_FILTER)
  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [rows, setRows] = useState<BacktestRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)

  // 전략 옵션 1회 로드
  useEffect(() => {
    fetch('/api/investment/strategies')
      .then(r => r.json())
      .then((j: { data?: Array<{ id: string; name: string; strategy_type: StrategyOption['strategy_type'] }> }) => {
        setStrategies(j.data ?? [])
      })
      .catch(() => setStrategies([]))
  }, [])

  // 필터 변경 시 백테스트 재조회 (debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (filter.strategyId) params.set('strategy_id', filter.strategyId)
        if (filter.ticker.trim()) params.set('ticker', filter.ticker.trim())
        const since = presetToSince(filter.preset)
        if (since) params.set('since', since)
        params.set('limit', '50')
        const r = await fetch(`/api/investment/backtest?${params.toString()}`)
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `${r.status}`)
        }
        const j = (await r.json()) as { data?: BacktestRunRow[] }
        setRows(j.data ?? [])
      } catch (e) {
        setError((e as Error).message)
        setRows([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [filter])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <HistoryFilters
        value={filter}
        onChange={setFilter}
        strategies={strategies}
      />

      {error && (
        <div className="p-3 rounded-xl bg-at-error-bg text-at-error text-sm">
          조회 실패: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-xl space-y-2">
          <HistoryIcon className="w-10 h-10 mx-auto text-at-text-weak" aria-hidden="true" />
          <p className="text-sm text-at-text-secondary">조건에 맞는 백테스트가 없습니다.</p>
          <p className="text-xs text-at-text-weak">[새로 비교] 탭에서 첫 백테스트를 실행해보세요.</p>
        </div>
      ) : (
        <HistoryTable
          rows={rows}
          strategies={strategies}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
        />
      )}

      {selectedIds.size >= 2 && !showCompare && (
        <div className="sticky bottom-4 z-10 flex justify-center">
          <button
            onClick={() => setShowCompare(true)}
            className="px-5 py-2.5 bg-at-accent hover:bg-at-accent-hover text-white rounded-xl text-sm font-medium shadow-lg"
          >
            선택 {selectedIds.size}개 비교
          </button>
        </div>
      )}

      {showCompare && selectedRows.length >= 2 && (
        <HistoryCompareView
          rows={selectedRows}
          strategies={strategies}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}
