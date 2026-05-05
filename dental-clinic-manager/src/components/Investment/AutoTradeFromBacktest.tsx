'use client'

/**
 * AutoTradeFromBacktest
 *
 * 자동매매 현황 영역의 "백테스트 기반 자동매매 추가" 섹션.
 * 종목을 먼저 선택 → 그 종목 + 사용자 전략의 백테스트 결과를 수익률 내림차순으로 표시.
 * "자동매매 추가" 클릭 시 해당 전략의 automation_level=2로 변경 + strategy_watchlist 추가.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, CheckCircle2, AlertCircle, TrendingUp, TrendingDown,
  Activity, Target, Zap,
} from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import type { InvestmentStrategy, Market } from '@/types/investment'

interface BacktestRun {
  id: string
  strategy_id: string
  ticker: string
  market: Market
  total_return: number | null
  win_rate: number | null
  max_drawdown: number | null
  sharpe_ratio: number | null
  total_trades: number | null
  start_date: string
  end_date: string
  completed_at: string | null
}

interface RankedRow {
  strategyId: string
  strategyName: string
  totalReturn: number
  winRate: number
  maxDrawdown: number
  sharpeRatio: number
  totalTrades: number
  market: Market
  ticker: string
  alreadyActive: boolean // automation_level === 2 + 이미 watchlist에 있음
  applying: boolean
  appliedAt: string | null
}

export default function AutoTradeFromBacktest() {
  const [ticker, setTicker] = useState('')
  const [tickerName, setTickerName] = useState('')
  const [market, setMarket] = useState<Market>('KR')

  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [watchlistMap, setWatchlistMap] = useState<Map<string, boolean>>(new Map())

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) setStrategies(json.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  const loadBacktestsForTicker = useCallback(async (t: string, m: Market) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/investment/backtest?ticker=${encodeURIComponent(t)}&limit=200`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '백테스트 결과 조회 실패')
        setRuns([])
      } else {
        const data = (json.data ?? []) as BacktestRun[]
        setRuns(data.filter((r) => r.market === m))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류')
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 선택된 (strategy_id, ticker, market)이 이미 watchlist에 있는지 확인
  const loadWatchlistFor = useCallback(async (strategyIds: string[], t: string, m: Market) => {
    if (strategyIds.length === 0) return
    const promises = strategyIds.map(async (sid) => {
      try {
        const r = await fetch(`/api/investment/watchlist?strategyId=${sid}`)
        const j = await r.json()
        if (!r.ok || !Array.isArray(j.data)) return [sid, false] as const
        const has = j.data.some((w: { ticker: string; market: string }) =>
          w.ticker === t.toUpperCase() && w.market === m
        )
        return [sid, has] as const
      } catch {
        return [sid, false] as const
      }
    })
    const results = await Promise.all(promises)
    const next = new Map<string, boolean>()
    for (const [sid, has] of results) next.set(sid, has)
    setWatchlistMap(next)
  }, [])

  // 종목 선택 변화 → 백테스트 + watchlist 재조회
  useEffect(() => {
    if (!ticker.trim()) {
      setRuns([])
      setWatchlistMap(new Map())
      setAppliedIds(new Set())
      return
    }
    loadBacktestsForTicker(ticker.trim().toUpperCase(), market)
  }, [ticker, market, loadBacktestsForTicker])

  useEffect(() => {
    if (!ticker.trim() || runs.length === 0) return
    const sids = Array.from(new Set(runs.map((r) => r.strategy_id)))
    loadWatchlistFor(sids, ticker.trim().toUpperCase(), market)
  }, [ticker, market, runs, loadWatchlistFor])

  // strategy_id별로 가장 좋은(totalReturn 최대) 결과 1개씩 추출 + 정렬
  const ranked: RankedRow[] = useMemo(() => {
    const stratMap = new Map<string, InvestmentStrategy>()
    for (const s of strategies) stratMap.set(s.id, s)

    const bestPerStrategy = new Map<string, BacktestRun>()
    for (const r of runs) {
      const cur = bestPerStrategy.get(r.strategy_id)
      const tr = Number(r.total_return ?? -Infinity)
      const curTr = cur ? Number(cur.total_return ?? -Infinity) : -Infinity
      if (!cur || tr > curTr) bestPerStrategy.set(r.strategy_id, r)
    }

    const rows: RankedRow[] = []
    for (const [sid, run] of bestPerStrategy) {
      const strat = stratMap.get(sid)
      if (!strat) continue // 삭제된 전략 제외
      const inWatchlist = watchlistMap.get(sid) === true
      const alreadyActive = strat.automation_level === 2 && inWatchlist
      rows.push({
        strategyId: sid,
        strategyName: strat.name,
        totalReturn: Number(run.total_return ?? 0),
        winRate: Number(run.win_rate ?? 0),
        maxDrawdown: Number(run.max_drawdown ?? 0),
        sharpeRatio: Number(run.sharpe_ratio ?? 0),
        totalTrades: Number(run.total_trades ?? 0),
        market: run.market,
        ticker: run.ticker,
        alreadyActive,
        applying: false,
        appliedAt: null,
      })
    }
    return rows.sort((a, b) => b.totalReturn - a.totalReturn)
  }, [runs, strategies, watchlistMap])

  const applyAutoTrade = async (row: RankedRow) => {
    if (row.alreadyActive || appliedIds.has(row.strategyId)) return
    setApplyingId(row.strategyId)
    setError(null)
    try {
      // 1) automation_level 2로 변경 (이미 2면 그대로)
      const strat = strategies.find((s) => s.id === row.strategyId)
      if (strat && strat.automation_level !== 2) {
        const r = await fetch('/api/investment/strategies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.strategyId, automationLevel: 2 }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || '자동화 레벨 변경 실패')
      }

      // 2) watchlist에 종목 추가 (이미 있으면 무시)
      if (!watchlistMap.get(row.strategyId)) {
        const r = await fetch('/api/investment/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategyId: row.strategyId,
            ticker: row.ticker,
            tickerName: tickerName || null,
            market: row.market,
          }),
        })
        const j = await r.json()
        if (!r.ok && !(j.error && j.error.includes('이미 추가'))) {
          throw new Error(j.error || '감시 종목 추가 실패')
        }
      }

      setAppliedIds((prev) => new Set(prev).add(row.strategyId))
      // 갱신
      loadStrategies()
      loadWatchlistFor([row.strategyId], row.ticker, row.market)
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동매매 추가 실패')
    } finally {
      setApplyingId(null)
    }
  }

  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const colorPnl = (v: number) =>
    v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-at-text-secondary'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border overflow-hidden">
      <div className="px-5 py-4 border-b border-at-border flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="font-semibold text-at-text">백테스트 기반 자동매매 추가</h3>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-at-text-secondary mb-1.5">
            종목 선택 <span className="text-at-text-weak">(선택 시 그 종목 백테스트 결과를 수익률순으로 표시)</span>
          </label>
          <div className="flex gap-2">
            <select
              value={market}
              onChange={(e) => {
                const next = e.target.value as Market
                if (next !== market) {
                  setMarket(next)
                  setTicker('')
                  setTickerName('')
                }
              }}
              className="px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm"
            >
              <option value="KR">국내</option>
              <option value="US">미국</option>
            </select>
            <div className="flex-1">
              <TickerSearch
                market={market}
                onSelect={(t, name, m) => {
                  setTicker(t)
                  setTickerName(name || '')
                  if (m && m !== market) setMarket(m)
                }}
                placeholder={market === 'KR' ? '예: 005930, 삼성전자' : '예: AAPL'}
                clearOnSelect={false}
              />
            </div>
          </div>
          {ticker && (
            <p className="mt-1.5 text-[11px] text-at-text-secondary">
              <span className="font-mono font-semibold text-at-text">{ticker}</span>
              {tickerName && tickerName !== ticker && <span className="ml-1.5">{tickerName}</span>}
            </p>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!ticker.trim() ? (
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <Target className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">종목을 먼저 선택해주세요</p>
            <p className="text-xs mt-1">선택한 종목으로 백테스트했던 전략을 결과 좋은 순으로 보여드립니다</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-at-text-weak" />
          </div>
        ) : ranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <Activity className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">이 종목으로 백테스트한 전략이 없습니다</p>
            <p className="text-xs mt-1">전략 페이지에서 백테스트를 먼저 실행해주세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-at-text-secondary">
              총 <span className="font-semibold text-at-text">{ranked.length}개</span> 전략 — 수익률 좋은 순
            </p>
            {ranked.map((row, idx) => {
              const isApplying = applyingId === row.strategyId
              const isApplied = row.alreadyActive || appliedIds.has(row.strategyId)
              return (
                <div
                  key={row.strategyId}
                  className="rounded-xl border border-at-border p-3 hover:border-at-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <p className="font-semibold text-sm text-at-text truncate">{row.strategyName}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 text-[11px] mt-2">
                        <Stat label="수익률" value={fmtPct(row.totalReturn)} colorClass={colorPnl(row.totalReturn)} icon={row.totalReturn >= 0 ? TrendingUp : TrendingDown} />
                        <Stat label="승률" value={`${row.winRate.toFixed(0)}%`} />
                        <Stat label="MDD" value={fmtPct(-Math.abs(row.maxDrawdown))} colorClass="text-blue-600" />
                        <Stat label="Sharpe" value={row.sharpeRatio.toFixed(2)} />
                        <Stat label="매매수" value={String(row.totalTrades)} />
                      </div>
                    </div>
                    <button
                      onClick={() => applyAutoTrade(row)}
                      disabled={isApplied || isApplying}
                      className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                        isApplied
                          ? 'bg-emerald-50 text-emerald-700 cursor-default'
                          : 'bg-at-accent text-white hover:bg-at-accent-hover disabled:opacity-50'
                      }`}
                    >
                      {isApplying ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 추가 중...</>
                      ) : isApplied ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> 추가됨</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5" /> 자동매매 추가</>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  colorClass,
  icon: Icon,
}: {
  label: string
  value: string
  colorClass?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div>
      <p className="text-[10px] text-at-text-weak">{label}</p>
      <p className={`font-mono font-semibold inline-flex items-center gap-0.5 ${colorClass ?? 'text-at-text'}`}>
        {Icon && <Icon className="w-3 h-3" />}
        {value}
      </p>
    </div>
  )
}
