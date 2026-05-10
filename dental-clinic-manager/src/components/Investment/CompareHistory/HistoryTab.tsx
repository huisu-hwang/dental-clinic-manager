'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { History as HistoryIcon } from 'lucide-react'
import HistoryFilters, { type HistoryFilterState } from './HistoryFilters'
import HistoryTable from './HistoryTable'
import HistoryCompareView from './HistoryCompareView'
import HistoryDateGroups from './HistoryDateGroups'
import HistoryHierarchy from './HistoryHierarchy'

export interface BacktestRunRow {
  id: string
  strategy_id: string | null
  preset_id?: string | null
  preset_name?: string | null
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
  /** backend LEFT JOIN — 삭제된 전략은 null */
  investment_strategies?: { name: string } | null
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
  preset: 'all',      // 기본은 전체 — 다중 종목·다중 전략 비교 시 한 세션이 50건을 쉽게 넘어
                      // 좁은 기간 필터 + 작은 limit 조합으로 옛 기록이 가려지던 문제를 막는다.
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
  // 사용자 보고: "백테스트 히스토리는 원래 처음 백테스트 실행했을 때의 매트릭스 형식으로
  // 날짜별로 정리해서 볼 수 있게 해야 한다" — 기본 뷰를 'matrix' (날짜별 결과표) 로 설정.
  // localStorage 에 마지막 선택 저장하여 다음 진입 시 유지.
  const [viewMode, setViewMode] = useState<'hierarchy' | 'matrix' | 'flat'>(() => {
    if (typeof window === 'undefined') return 'matrix'
    const saved = window.localStorage.getItem('compareHistoryViewMode')
    return (saved === 'hierarchy' || saved === 'matrix' || saved === 'flat') ? saved : 'matrix'
  })

  // viewMode 변경 시 localStorage 에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('compareHistoryViewMode', viewMode) } catch { /* ignore */ }
  }, [viewMode])

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
        // 비교 한 번에 N종목 × M전략(예: 10×5=50) 행이 생성될 수 있어 작은 limit이면
        // 오늘 세션이 차지하고 옛 기록이 잘려 보인다. 서버 캡(500)에 가깝게 충분히 키운다.
        params.set('limit', '500')
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
        <>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-xl border border-at-border bg-white text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 ${viewMode === 'matrix' ? 'bg-at-accent text-white' : 'text-at-text-secondary hover:bg-at-surface-alt'}`}
              >
                날짜별 결과표 (기본)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hierarchy')}
                className={`px-3 py-1.5 ${viewMode === 'hierarchy' ? 'bg-at-accent text-white' : 'text-at-text-secondary hover:bg-at-surface-alt'}`}
              >
                날짜·세션 트리
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                className={`px-3 py-1.5 ${viewMode === 'flat' ? 'bg-at-accent text-white' : 'text-at-text-secondary hover:bg-at-surface-alt'}`}
              >
                평면 목록
              </button>
            </div>
          </div>
          {viewMode === 'hierarchy' ? (
            <HistoryHierarchy
              rows={rows}
              strategies={strategies}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
            />
          ) : viewMode === 'matrix' ? (
            <HistoryDateGroups
              rows={rows}
              strategies={strategies}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
            />
          ) : (
            <HistoryTable
              rows={rows}
              strategies={strategies}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
            />
          )}
        </>
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
