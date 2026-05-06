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
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import type { InvestmentStrategy, Market } from '@/types/investment'

interface BacktestRun {
  id: string
  /** 프리셋 백테스트면 NULL */
  strategy_id: string | null
  preset_id: string | null
  preset_name: string | null
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
  /** backend LEFT JOIN — 삭제된 전략은 null */
  investment_strategies?: {
    name: string
    automation_level: number
    is_active: boolean
  } | null
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
  /** 전략이 삭제됐거나 매핑이 없으면 자동매매 추가 불가 */
  canAdd: boolean
}

export default function AutoTradeFromBacktest() {
  const [ticker, setTicker] = useState('')
  const [tickerName, setTickerName] = useState('')
  const [market, setMarket] = useState<Market>('KR')

  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [watchlistMap, setWatchlistMap] = useState<Map<string, boolean>>(new Map())
  /**
   * automation_level=2 인 모든 strategy의 watchlist ticker 모음.
   * key: `${market}:${tickerUpper}`. 프리셋 row가 자동 추가 후
   * 어떤 활성 strategy와 같은 종목이면 "추가됨"으로 표시되도록 보조.
   */
  const [activeTickerSet, setActiveTickerSet] = useState<Set<string>>(new Set())

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

  // 활성 strategy의 watchlist ticker 모음 — strategies 변경 시 재로드
  useEffect(() => {
    const activeStrategies = strategies.filter((s) => s.automation_level === 2)
    if (activeStrategies.length === 0) {
      setActiveTickerSet(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      const responses = await Promise.all(
        activeStrategies.map(async (s) => {
          try {
            const r = await fetch(`/api/investment/watchlist?strategyId=${s.id}`)
            const j = await r.json()
            if (!r.ok || !Array.isArray(j.data)) return [] as Array<{ ticker: string; market: string }>
            return j.data as Array<{ ticker: string; market: string }>
          } catch { return [] }
        })
      )
      if (cancelled) return
      const next = new Set<string>()
      for (const wl of responses) {
        for (const w of wl) {
          if (!w.ticker || !w.market) continue
          next.add(`${w.market}:${w.ticker.toUpperCase()}`)
        }
      }
      setActiveTickerSet(next)
    })()
    return () => { cancelled = true }
  }, [strategies])

  /**
   * 백테스트 결과 로드.
   * t/m이 비어있으면 사용자의 모든 백테스트 (limit=200) — 종목 미선택 모드.
   */
  const loadBacktests = useCallback(async (t?: string, m?: Market) => {
    setLoading(true)
    setError(null)
    try {
      const url = t
        ? `/api/investment/backtest?ticker=${encodeURIComponent(t)}&limit=500`
        : `/api/investment/backtest?limit=500`
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '백테스트 결과 조회 실패')
        setRuns([])
      } else {
        const data = (json.data ?? []) as BacktestRun[]
        setRuns(t && m ? data.filter((r) => r.market === m) : data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류')
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * (strategy_id, ticker, market) 조합별로 watchlist 등록 여부 확인.
   * Map key는 `${sid}::${market}::${ticker}` 형식.
   */
  const loadWatchlistForCombos = useCallback(
    async (combos: Array<{ sid: string; ticker: string; market: Market }>) => {
      if (combos.length === 0) return
      const sids = Array.from(new Set(combos.map((c) => c.sid)))
      // strategy_id별 watchlist를 한 번씩만 조회
      const wlByStrategy = new Map<string, Array<{ ticker: string; market: string }>>()
      await Promise.all(sids.map(async (sid) => {
        try {
          const r = await fetch(`/api/investment/watchlist?strategyId=${sid}`)
          const j = await r.json()
          if (!r.ok || !Array.isArray(j.data)) return
          wlByStrategy.set(sid, j.data as Array<{ ticker: string; market: string }>)
        } catch { /* ignore */ }
      }))

      const next = new Map<string, boolean>()
      for (const c of combos) {
        const items = wlByStrategy.get(c.sid) ?? []
        const has = items.some((w) => w.ticker === c.ticker.toUpperCase() && w.market === c.market)
        next.set(`${c.sid}::${c.market}::${c.ticker.toUpperCase()}`, has)
      }
      setWatchlistMap(next)
    },
    []
  )

  // 종목 선택 변화 → 백테스트 재조회 (ticker 없으면 전체)
  useEffect(() => {
    setAppliedIds(new Set())
    setWatchlistMap(new Map())
    if (ticker.trim()) {
      loadBacktests(ticker.trim().toUpperCase(), market)
    } else {
      loadBacktests()
    }
  }, [ticker, market, loadBacktests])

  // 모드 분기: ticker 선택 = 한 종목의 모든 전략 / 미선택 = 종목별 best 전략 1개
  const isPickedMode = Boolean(ticker.trim())

  const ranked: RankedRow[] = useMemo(() => {
    const stratMap = new Map<string, InvestmentStrategy>()
    for (const s of strategies) stratMap.set(s.id, s)

    let bestRuns: BacktestRun[] = []

    /** run의 그룹 키 — 사용자 전략은 strategy_id, 프리셋은 preset:<id> */
    const groupKeyOf = (r: BacktestRun) =>
      r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`

    if (isPickedMode) {
      // strategy(또는 preset)별 best totalReturn 1개
      const bestPerStrategy = new Map<string, BacktestRun>()
      for (const r of runs) {
        const k = groupKeyOf(r)
        const cur = bestPerStrategy.get(k)
        const tr = Number(r.total_return ?? -Infinity)
        const curTr = cur ? Number(cur.total_return ?? -Infinity) : -Infinity
        if (!cur || tr > curTr) bestPerStrategy.set(k, r)
      }
      bestRuns = Array.from(bestPerStrategy.values())
    } else {
      // (ticker, market) 단위로 best totalReturn 1개 (그 종목의 최고 성과 전략)
      const bestPerTicker = new Map<string, BacktestRun>()
      for (const r of runs) {
        const k = `${r.market}::${r.ticker}`
        const cur = bestPerTicker.get(k)
        const tr = Number(r.total_return ?? -Infinity)
        const curTr = cur ? Number(cur.total_return ?? -Infinity) : -Infinity
        if (!cur || tr > curTr) bestPerTicker.set(k, r)
      }
      bestRuns = Array.from(bestPerTicker.values())
    }

    const rows: RankedRow[] = []
    for (const run of bestRuns) {
      const isPreset = !run.strategy_id
      const strat = run.strategy_id ? stratMap.get(run.strategy_id) : undefined

      let strategyName: string
      let canAdd: boolean
      if (isPreset) {
        strategyName = run.preset_name ?? `프리셋 #${run.preset_id ?? 'custom'}`
        canAdd = false // 프리셋은 자동매매 추가 불가 (저장 전략 없음)
      } else {
        const joinedName = run.investment_strategies?.name
        strategyName = strat?.name ?? joinedName ?? `전략 #${(run.strategy_id ?? '').slice(0, 8)}`
        canAdd = Boolean(strat) // 자동매매 추가는 현재 사용자 보유 전략만
      }

      const automationLevel =
        strat?.automation_level ?? run.investment_strategies?.automation_level ?? 1

      const groupId = run.strategy_id ?? `preset:${run.preset_id ?? 'custom'}`
      const wlKey = `${groupId}::${run.market}::${run.ticker.toUpperCase()}`
      const inWatchlist = watchlistMap.get(wlKey) === true
      const tickerKey = `${run.market}:${run.ticker.toUpperCase()}`
      const tickerActiveElsewhere = activeTickerSet.has(tickerKey)
      // 프리셋 row: 자동 추가 후 같은 종목이 어떤 active strategy의 watchlist에 있으면 "추가됨"
      // 사용자 strategy row: 그 strategy가 active=2 + 자기 watchlist 포함 (기존)
      const alreadyActive = isPreset
        ? tickerActiveElsewhere
        : automationLevel === 2 && inWatchlist

      rows.push({
        strategyId: groupId,
        strategyName,
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
        canAdd,
      })
    }
    return rows.sort((a, b) => b.totalReturn - a.totalReturn)
  }, [runs, strategies, watchlistMap, activeTickerSet, isPickedMode])

  // ranked 변화 시 → watchlist 조합 조회 (프리셋 group은 제외)
  useEffect(() => {
    if (ranked.length === 0) return
    const combos = ranked
      .filter((r) => r.canAdd) // 프리셋·삭제 전략은 watchlist 조회 의미 없음
      .map((r) => ({ sid: r.strategyId, ticker: r.ticker, market: r.market }))
    if (combos.length > 0) loadWatchlistForCombos(combos)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs])

  const rowKey = (r: RankedRow) => `${r.strategyId}::${r.market}::${r.ticker.toUpperCase()}`

  const applyAutoTrade = async (row: RankedRow) => {
    const key = rowKey(row)
    if (row.alreadyActive || appliedIds.has(key)) return
    setApplyingId(key)
    setError(null)
    try {
      // 프리셋 row(canAdd=false)면 먼저 사용자 strategy로 자동 등록
      let effectiveStrategyId = row.strategyId
      if (!row.canAdd) {
        const presetId = row.strategyId.startsWith('preset:')
          ? row.strategyId.slice('preset:'.length)
          : null
        if (!presetId) throw new Error('프리셋 정보를 찾을 수 없습니다')
        const preset = PRESET_STRATEGIES.find((p) => p.id === presetId)
        if (!preset) throw new Error('프리셋 정보를 찾을 수 없습니다')

        const timeframe = preset.mode === 'daytrading' ? '5m' : '1d'
        const createRes = await fetch('/api/investment/strategies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${preset.name} (자동 추가)`,
            description: preset.description,
            targetMarket: row.market,
            timeframe,
            indicators: preset.indicators,
            buyConditions: preset.buyConditions,
            sellConditions: preset.sellConditions,
            riskSettings: preset.riskSettings,
            automationLevel: 2,
            mode: preset.mode ?? 'swing',
            sourcePresetId: preset.id,
          }),
        })
        const createJson = await createRes.json()
        if (!createRes.ok || !createJson.data?.id) {
          throw new Error(createJson.error || '프리셋 기반 전략 생성 실패')
        }
        effectiveStrategyId = createJson.data.id as string
      } else {
        // 1) 기존 사용자 전략이면 automation_level 2로 변경 (이미 2면 스킵)
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
      }

      // 2) watchlist에 종목 추가 (이미 있으면 무시)
      const wlKey = `${effectiveStrategyId}::${row.market}::${row.ticker.toUpperCase()}`
      if (!watchlistMap.get(wlKey)) {
        const r = await fetch('/api/investment/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategyId: effectiveStrategyId,
            ticker: row.ticker,
            tickerName: isPickedMode ? (tickerName || null) : null,
            market: row.market,
          }),
        })
        const j = await r.json()
        if (!r.ok && !(j.error && j.error.includes('이미 추가'))) {
          throw new Error(j.error || '감시 종목 추가 실패')
        }
      }

      // 3) 즉시 활성화 — is_active=true (감시 종목 추가 후 가능)
      // 이미 활성화돼 있으면 backend가 그냥 idempotent 처리하므로 항상 호출
      const targetStrat = strategies.find((s) => s.id === effectiveStrategyId)
      if (!targetStrat?.is_active) {
        try {
          const actRes = await fetch('/api/investment/strategies', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: effectiveStrategyId, isActive: true }),
          })
          if (!actRes.ok) {
            const aj = await actRes.json().catch(() => ({}))
            // 계좌 미연결은 사용자에게 안내 — watchlist는 등록됐으니 이후 연결 후 활성화 가능
            if (aj.code === 'NO_CREDENTIAL') {
              setError('자동매매가 등록되었지만 활성화되지 못했습니다 — KIS 증권 계좌를 연결해주세요.')
            } else {
              console.warn('[AutoTrade] 활성화 실패:', aj.error)
            }
          }
        } catch (err) {
          console.warn('[AutoTrade] 활성화 호출 오류:', err)
        }
      }

      setAppliedIds((prev) => new Set(prev).add(key))
      // 갱신
      loadStrategies()
      loadWatchlistForCombos([{ sid: effectiveStrategyId, ticker: row.ticker, market: row.market }])
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
            종목 선택 <span className="text-at-text-weak">(선택 안 하면 종목별 최고 성과 전략 자동 표시)</span>
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

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-at-text-weak" />
          </div>
        ) : ranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            {isPickedMode ? <Activity className="w-10 h-10 mb-2 opacity-30" /> : <Target className="w-10 h-10 mb-2 opacity-30" />}
            <p className="text-sm">
              {isPickedMode
                ? '이 종목으로 백테스트한 전략이 없습니다'
                : '백테스트 이력이 없습니다'}
            </p>
            <p className="text-xs mt-1">
              {isPickedMode
                ? '전략 페이지에서 백테스트를 먼저 실행해주세요'
                : '전략 페이지에서 백테스트를 실행하면 여기에 자동으로 표시됩니다'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-at-text-secondary">
              {isPickedMode ? (
                <>
                  총 <span className="font-semibold text-at-text">{ranked.length}개</span> 전략 — 수익률 좋은 순
                </>
              ) : (
                <>
                  종목별 최고 성과 전략{' '}
                  <span className="font-semibold text-at-text">{ranked.length}개</span> — 수익률 좋은 순
                </>
              )}
            </p>
            {ranked.map((row, idx) => {
              const key = rowKey(row)
              const isApplying = applyingId === key
              const isApplied = row.alreadyActive || appliedIds.has(key)
              return (
                <div
                  key={key}
                  className="rounded-xl border border-at-border p-3 hover:border-at-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        {!isPickedMode && (
                          <>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${row.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {row.market}
                            </span>
                            <span className="font-mono text-xs font-semibold text-at-text">{row.ticker}</span>
                            <span className="text-at-text-weak">·</span>
                          </>
                        )}
                        <p className={`font-semibold text-sm text-at-text truncate ${!isPickedMode ? 'text-at-text-secondary text-xs' : ''}`}>
                          {row.strategyName}
                        </p>
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
                      title={!row.canAdd ? '프리셋 전략으로 새 전략을 자동 생성한 뒤 자동매매를 활성화합니다' : undefined}
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
