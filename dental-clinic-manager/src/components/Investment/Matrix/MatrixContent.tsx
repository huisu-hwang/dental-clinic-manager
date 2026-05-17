'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import MatrixFilters from './MatrixFilters'
import MatrixLeaderboard from './MatrixLeaderboard'
import MatrixGrid from './MatrixGrid'
import MatrixDetailDrawer from './MatrixDetailDrawer'
import type { MatrixRow, MatrixAggregateRow, MarketFilter, PeriodWindow, SortKey, SortDir } from './types'

// 정렬 방향 기본값 — 메트릭별로 자연스러운 방향 (수익률/Sharpe/PF/승률/표본수=내림차순, MDD=오름차순)
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  avg_return: 'desc',
  avg_annualized: 'desc',
  avg_sharpe: 'desc',
  avg_mdd: 'asc',           // 낮은 MDD가 좋음
  avg_winrate: 'desc',
  avg_profit_factor: 'desc',
  best_return: 'desc',
  worst_return: 'desc',
  sample_size: 'desc',
}

function compareNullable(a: number | null | undefined, b: number | null | undefined, dir: SortDir): number {
  // null 은 항상 뒤로
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a - b : b - a
}

interface SharedStrategy {
  id: string
  name: string
}

export default function MatrixContent() {
  const [market, setMarket] = useState<MarketFilter>('ALL')
  const [periodWindow, setPeriodWindow] = useState<PeriodWindow>('5Y')
  const [tickersText, setTickersText] = useState('')
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(
    PRESET_STRATEGIES.slice(0, 10).map(p => p.id)
  )
  const [sortKey, setSortKey] = useState<SortKey>('avg_return')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [sharedStrategies, setSharedStrategies] = useState<SharedStrategy[]>([])
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([])
  const [aggregateRows, setAggregateRows] = useState<MatrixAggregateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCell, setSelectedCell] = useState<MatrixRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchInfo, setLastFetchInfo] = useState<{ count: number; ms: number } | null>(null)

  // 사용 가능한 전략 리스트 = 프리셋 + 공유 사용자 전략
  const availableStrategies = useMemo(() => {
    const list: Array<{ id: string; name: string; type: 'preset' | 'shared' }> = []
    for (const p of PRESET_STRATEGIES) list.push({ id: p.id, name: p.name, type: 'preset' })
    for (const s of sharedStrategies) list.push({ id: s.id, name: s.name, type: 'shared' })
    return list
  }, [sharedStrategies])

  const strategyNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of availableStrategies) map.set(s.id, s.name)
    return map
  }, [availableStrategies])

  // 정렬된 aggregateRows + 정렬 기반 전략 순서 (Grid 행 동기화용)
  const sortedAggregateRows = useMemo(() => {
    const arr = [...aggregateRows]
    arr.sort((a, b) => compareNullable(a[sortKey], b[sortKey], sortDir))
    return arr
  }, [aggregateRows, sortKey, sortDir])

  const strategyOrder = useMemo(() => {
    // SPLIT/ALL 에서는 동일 entry_id 가 KR/US 양쪽 row 로 존재 — KR 우선 한 번씩만
    const seen = new Set<string>()
    const order: string[] = []
    for (const r of sortedAggregateRows) {
      if (!seen.has(r.entry_id)) {
        order.push(r.entry_id)
        seen.add(r.entry_id)
      }
    }
    return order
  }, [sortedAggregateRows])

  const handleSortChange = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(DEFAULT_DIR[key])
    }
  }, [sortKey])

  // 공유 전략 목록 로딩 (is_shared=true 인 전략들 — share_alias 우선)
  useEffect(() => {
    fetch('/api/investment/strategies/public')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => {
        const list = (j.data ?? []) as Array<{ id: string; name: string; share_alias: string | null }>
        setSharedStrategies(list.map(s => ({ id: s.id, name: s.share_alias || s.name })))
      })
      .catch(() => setSharedStrategies([]))
  }, [])

  // 데이터 fetch
  const fetchData = useCallback(async () => {
    if (selectedStrategies.length === 0) {
      setMatrixRows([])
      setAggregateRows([])
      return
    }
    setLoading(true)
    setError(null)
    const t0 = performance.now()

    const queryParams = new URLSearchParams({
      period_window: periodWindow,
      entry_ids: selectedStrategies.join(','),
      limit: '2000',
    })
    if (market === 'KR' || market === 'US') {
      queryParams.set('market', market)
    } else {
      queryParams.set('market', 'ALL')
    }
    const tickers = tickersText.split(',').map(s => s.trim()).filter(Boolean)
    if (tickers.length > 0) queryParams.set('tickers', tickers.join(','))

    const aggParams = new URLSearchParams({
      period_window: periodWindow,
      group_by: market === 'SPLIT' || market === 'ALL' ? 'market' : 'market',
    })
    if (market === 'KR' || market === 'US') {
      aggParams.set('market', market)
    }

    try {
      const [queryRes, aggRes] = await Promise.all([
        fetch(`/api/investment/matrix/query?${queryParams.toString()}`),
        fetch(`/api/investment/matrix/aggregate?${aggParams.toString()}`),
      ])
      if (!queryRes.ok || !aggRes.ok) {
        throw new Error(`API 응답 실패 (query=${queryRes.status}, aggregate=${aggRes.status})`)
      }
      const queryJson = await queryRes.json()
      const aggJson = await aggRes.json()
      const rows = (queryJson.data ?? []) as MatrixRow[]
      // 선택된 전략으로 필터링 (aggregate)
      const aggregateAll = (aggJson.data ?? []) as MatrixAggregateRow[]
      const selectedSet = new Set(selectedStrategies)
      const agg = aggregateAll.filter(r => selectedSet.has(r.entry_id))

      setMatrixRows(rows)
      setAggregateRows(agg)
      setLastFetchInfo({ count: rows.length, ms: Math.round(performance.now() - t0) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setMatrixRows([])
      setAggregateRows([])
    } finally {
      setLoading(false)
    }
  }, [market, periodWindow, selectedStrategies, tickersText])

  // 필터 변경 시 자동 fetch
  useEffect(() => {
    const id = setTimeout(fetchData, 250)
    return () => clearTimeout(id)
  }, [fetchData])

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">전략 비교 매트릭스</h1>
          <p className="mt-1 text-sm text-gray-600">
            모든 종목 × 모든 기간 × 모든 전략 백테스트가 사전계산되어 있습니다. 필터로 즉시 조회하세요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard?tab=investment&sub=compare"
            className="text-sm text-blue-600 hover:underline"
          >
            ad-hoc 비교 모드 →
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          오류: {error}
        </div>
      )}

      <MatrixFilters
        market={market}
        onMarketChange={setMarket}
        periodWindow={periodWindow}
        onPeriodChange={setPeriodWindow}
        selectedStrategies={selectedStrategies}
        onStrategiesChange={setSelectedStrategies}
        availableStrategies={availableStrategies}
        tickersText={tickersText}
        onTickersChange={setTickersText}
        loading={loading}
      />

      {lastFetchInfo && (
        <div className="text-xs text-gray-500">
          {lastFetchInfo.count.toLocaleString()}건 ({lastFetchInfo.ms}ms)
          {loading && ' · 로딩 중...'}
        </div>
      )}

      <MatrixLeaderboard
        rows={sortedAggregateRows}
        market={market}
        periodWindow={periodWindow}
        strategyNames={strategyNames}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
      />

      <MatrixGrid
        rows={matrixRows}
        market={market}
        strategyNames={strategyNames}
        strategyOrder={strategyOrder}
        onCellClick={setSelectedCell}
      />

      {selectedCell && (
        <MatrixDetailDrawer
          row={selectedCell}
          strategyNames={strategyNames}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  )
}
