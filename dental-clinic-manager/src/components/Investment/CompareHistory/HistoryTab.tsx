'use client'

import { useEffect, useState, useCallback } from 'react'
import { History as HistoryIcon, RefreshCw } from 'lucide-react'
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

// 한 번 비교에서 N종목 × M전략(예: 10×5=50)이 생성될 수 있어 서버 캡(500)에 가깝게 충분히.
const FETCH_LIMIT = 500
// 사용자 보고: "히스토리 조회 실패"가 잦음 → 명시적 타임아웃 + 자동 1회 재시도.
const FETCH_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 800

async function fetchHistoryOnce(signal: AbortSignal): Promise<BacktestRunRow[]> {
  const params = new URLSearchParams()
  params.set('limit', String(FETCH_LIMIT))
  // light=1: 큰 jsonb(equity_curve/trades/full_metrics) 제외. 세션 클릭 시 ids=… 로 별도 fetch.
  params.set('light', '1')
  const r = await fetch(`/api/investment/backtest?${params.toString()}`, {
    signal,
    cache: 'no-store',
  })
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${r.status}`)
  }
  const j = (await r.json()) as { data?: BacktestRunRow[] }
  return j.data ?? []
}

export default function HistoryTab() {
  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [rows, setRows] = useState<BacktestRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 전략 옵션 1회 로드 — 세션 안 행 라벨에 사용
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/investment/strategies', { signal: ctrl.signal, cache: 'no-store' })
      .then(r => r.json())
      .then((j: { data?: Array<{ id: string; name: string; strategy_type: StrategyOption['strategy_type'] }> }) => {
        setStrategies(j.data ?? [])
      })
      .catch(() => setStrategies([]))
    return () => ctrl.abort()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // AbortController + 명시적 타임아웃 (기본 fetch는 너무 오래 매달림 → 사용자에겐 "조회 실패"로 보임)
    const tryFetch = async (): Promise<BacktestRunRow[]> => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      try {
        return await fetchHistoryOnce(ctrl.signal)
      } finally {
        clearTimeout(timer)
      }
    }

    try {
      let data: BacktestRunRow[]
      try {
        data = await tryFetch()
      } catch (e1) {
        // 일시 네트워크/타임아웃은 1회 자동 재시도
        await new Promise(res => setTimeout(res, RETRY_DELAY_MS))
        try {
          data = await tryFetch()
        } catch (e2) {
          const msg1 = e1 instanceof Error ? e1.message : String(e1)
          const msg2 = e2 instanceof Error ? e2.message : String(e2)
          throw new Error(msg2.includes('aborted') || msg1.includes('aborted')
            ? '응답이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.'
            : msg2)
        }
      }
      setRows(data)
    } catch (e) {
      setError((e as Error).message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-at-text-secondary">
          과거 비교 백테스트 세션 목록입니다. 항목을 클릭하면 그때의 매트릭스·비교표가 그대로 다시 열립니다.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-at-border text-xs text-at-text-secondary hover:bg-at-surface-alt"
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-at-error-bg text-at-error text-sm flex items-center justify-between gap-3">
          <span>조회 실패: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs underline whitespace-nowrap"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-xl space-y-2">
          <HistoryIcon className="w-10 h-10 mx-auto text-at-text-weak" aria-hidden="true" />
          <p className="text-sm text-at-text-secondary">아직 실행한 백테스트가 없습니다.</p>
          <p className="text-xs text-at-text-weak">[새로 비교] 탭에서 첫 백테스트를 실행해보세요.</p>
        </div>
      ) : (
        <HistoryHierarchy
          rows={rows}
          strategies={strategies}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
        />
      )}
    </div>
  )
}
