'use client'

/**
 * 백테스트 히스토리 3단계 drill-down 네비게이션:
 *  1) 날짜 리스트 — 최근→과거, 그 날의 세션 수·평균 수익률 표시
 *  2) 시간 리스트 — 같은 날짜 안에서 인접 분 cluster를 한 세션으로 묶어 시간순 표시
 *  3) 세션 결과 — 라이브 비교 탭과 동일한 결과 화면 (CompareResultsView 재사용)
 */

import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { BacktestRunRow } from './HistoryTab'
import { CompareResultsView, type BacktestResultItem } from '@/components/Investment/CompareContent'
import type { BacktestMetrics, BacktestTrade, EquityCurvePoint } from '@/types/investment'

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  rows: BacktestRunRow[]
  strategies: StrategyOption[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}

/**
 * backtest_runs row → CompareResultsView가 기대하는 BacktestResultItem 변환.
 * full_metrics(jsonb)는 BacktestMetrics 전체 스냅샷이라 그대로 사용.
 */
function toResultItem(
  r: BacktestRunRow,
  strategyName: string,
): BacktestResultItem {
  const metrics: BacktestMetrics = (r.full_metrics as unknown as BacktestMetrics) ?? {
    totalReturn: r.total_return ?? 0,
    annualizedReturn: 0,
    maxDrawdown: r.max_drawdown ?? 0,
    sharpeRatio: r.sharpe_ratio ?? 0,
    winRate: r.win_rate ?? 0,
    totalTrades: r.total_trades ?? 0,
    profitFactor: 0,
    avgWin: 0, avgLoss: 0,
    maxConsecutiveWins: 0, maxConsecutiveLosses: 0, avgHoldingDays: 0,
  }
  const trades = (r.trades as unknown as BacktestTrade[]) ?? []
  const equityCurve = (r.equity_curve as unknown as EquityCurvePoint[]) ?? []
  return {
    rowKey: r.id,
    strategyId: r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`,
    strategyName,
    ticker: r.ticker,
    tickerName: r.ticker,
    metrics,
    trades,
    equityCurve,
  }
}

interface SessionGroup {
  /** 세션 id (가장 이른 timestamp 기반) */
  id: string
  startedAt: string // ISO
  rows: BacktestRunRow[]
}

interface DayGroup {
  day: string // YYYY-MM-DD
  sessions: SessionGroup[]
  totalRows: number
  avgReturn: number
}

const SESSION_GAP_MS = 60 * 1000 // 60초 이내 인접 row는 같은 세션

const formatDayHeader = (yyyymmdd: string): string => {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()]
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${day})`
}

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  } catch {
    return iso.slice(11, 19)
  }
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

const formatNum = (v: number | null | undefined, digits = 2): string => {
  if (v == null) return '-'
  return v.toFixed(digits)
}

const colorPnl = (v: number | null | undefined) => {
  if (v == null) return 'text-slate-500'
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-slate-500'
}

const bgPnl = (v: number | null | undefined) => {
  if (v == null) return 'bg-slate-50'
  return v > 0 ? 'bg-red-50' : v < 0 ? 'bg-blue-50' : 'bg-slate-50'
}

export default function HistoryHierarchy({ rows, strategies, selectedIds, onToggleSelected }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const strategyById = useMemo(() => {
    const m = new Map<string, StrategyOption>()
    for (const s of strategies) m.set(s.id, s)
    return m
  }, [strategies])

  // 일자 + 세션 cluster 그룹핑
  const dayGroups: DayGroup[] = useMemo(() => {
    const byDay = new Map<string, BacktestRunRow[]>()
    for (const r of rows) {
      const day = (r.executed_at ?? '').slice(0, 10)
      if (!day) continue
      const arr = byDay.get(day) ?? []
      arr.push(r)
      byDay.set(day, arr)
    }

    const result: DayGroup[] = []
    for (const [day, dayRows] of byDay) {
      // executed_at 오름차순 정렬 후 인접 row 간 60초 이내면 같은 세션
      const sorted = [...dayRows].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
      const sessions: SessionGroup[] = []
      let bucket: BacktestRunRow[] = []
      let lastTs = 0
      for (const r of sorted) {
        const ts = new Date(r.executed_at).getTime()
        if (bucket.length === 0 || ts - lastTs <= SESSION_GAP_MS) {
          bucket.push(r)
        } else {
          sessions.push({ id: bucket[0].id + ':' + bucket[0].executed_at, startedAt: bucket[0].executed_at, rows: bucket })
          bucket = [r]
        }
        lastTs = ts
      }
      if (bucket.length > 0) {
        sessions.push({ id: bucket[0].id + ':' + bucket[0].executed_at, startedAt: bucket[0].executed_at, rows: bucket })
      }

      // 최신 세션이 위로
      sessions.reverse()

      const returns = dayRows.map((r) => Number(r.total_return ?? 0))
      const avgReturn = returns.length > 0 ? returns.reduce((s, v) => s + v, 0) / returns.length : 0

      result.push({ day, sessions, totalRows: dayRows.length, avgReturn })
    }
    return result.sort((a, b) => b.day.localeCompare(a.day))
  }, [rows])

  // ========= Level 3: 세션 결과 매트릭스 =========
  if (selectedDay && selectedSessionId) {
    const day = dayGroups.find((d) => d.day === selectedDay)
    const session = day?.sessions.find((s) => s.id === selectedSessionId)
    if (!session) {
      return <Backable onBack={() => setSelectedSessionId(null)} label="세션을 찾을 수 없음" />
    }
    return (
      <SessionResultView
        day={selectedDay}
        session={session}
        strategyById={strategyById}
        onBack={() => setSelectedSessionId(null)}
      />
    )
  }

  // ========= Level 2: 시간 리스트 =========
  if (selectedDay) {
    const day = dayGroups.find((d) => d.day === selectedDay)
    if (!day) {
      return <Backable onBack={() => setSelectedDay(null)} label="날짜를 찾을 수 없음" />
    }
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelectedDay(null)}
          className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text"
        >
          <ArrowLeft className="w-4 h-4" />
          날짜 목록
        </button>
        <div>
          <h3 className="text-base font-semibold text-at-text">{formatDayHeader(day.day)}</h3>
          <p className="text-xs text-at-text-secondary mt-0.5">총 {day.totalRows}건 · {day.sessions.length}회 실행</p>
        </div>
        <div className="space-y-2">
          {day.sessions.map((s, idx) => {
            const tickers = new Set(s.rows.map((r) => r.ticker))
            const strats = new Set(s.rows.map((r) => r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`))
            const returns = s.rows.map((r) => Number(r.total_return ?? 0))
            const avg = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
            const best = returns.length > 0 ? Math.max(...returns) : 0
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className="w-full text-left rounded-xl border border-at-border bg-white px-4 py-3 hover:border-at-accent transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-at-text">
                        세션 #{day.sessions.length - idx} · {formatTime(s.startedAt)}
                      </span>
                      <span className="text-[11px] text-at-text-secondary">
                        {strats.size}전략 × {tickers.size}종목 = {s.rows.length}건
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px]">
                      <span className={`font-mono ${colorPnl(avg)}`}>평균 {formatPct(avg)}</span>
                      <span className={`font-mono ${colorPnl(best)}`}>최고 {formatPct(best)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-at-text-weak flex-shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ========= Level 1: 날짜 리스트 =========
  if (dayGroups.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs text-at-text-secondary">
        총 {rows.length}건 · {dayGroups.length}일자
      </p>
      {dayGroups.map((d) => (
        <button
          key={d.day}
          onClick={() => setSelectedDay(d.day)}
          className="w-full text-left rounded-xl border border-at-border bg-white px-4 py-3 hover:border-at-accent transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-at-text">{formatDayHeader(d.day)}</p>
              <p className="text-[11px] text-at-text-secondary mt-0.5">
                {d.sessions.length}회 실행 · 총 {d.totalRows}건 · 평균 {' '}
                <span className={`font-mono ${colorPnl(d.avgReturn)}`}>{formatPct(d.avgReturn)}</span>
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-at-text-weak flex-shrink-0" />
          </div>
        </button>
      ))}
    </div>
  )
}

function Backable({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text">
        <ArrowLeft className="w-4 h-4" />
        뒤로
      </button>
      <p className="text-sm text-at-text-secondary">{label}</p>
    </div>
  )
}

function SessionResultView({
  day,
  session,
  strategyById,
  onBack,
}: {
  day: string
  session: SessionGroup
  strategyById: Map<string, StrategyOption>
  onBack: () => void
}) {
  const rowLabelOf = (r: BacktestRunRow): string => {
    if (r.strategy_id) {
      return strategyById.get(r.strategy_id)?.name
        ?? r.investment_strategies?.name
        ?? `전략 #${r.strategy_id.slice(0, 8)}`
    }
    return r.preset_name ?? `프리셋 #${r.preset_id ?? 'custom'}`
  }

  // 라이브 비교 결과와 동일 구조로 변환
  const results: BacktestResultItem[] = useMemo(
    () => session.rows.map((r) => toResultItem(r, rowLabelOf(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  )

  const tickers = useMemo(() => {
    const seen = new Set<string>()
    const arr: { ticker: string; name: string }[] = []
    for (const r of session.rows) {
      const k = `${r.market}:${r.ticker}`
      if (seen.has(k)) continue
      seen.add(k)
      arr.push({ ticker: r.ticker, name: r.ticker })
    }
    return arr
  }, [session])

  const strategies = useMemo(() => {
    const seen = new Set<string>()
    const arr: { key: string; name: string }[] = []
    for (const r of session.rows) {
      const key = r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`
      if (seen.has(key)) continue
      seen.add(key)
      arr.push({ key, name: rowLabelOf(r) })
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const startDate = useMemo(() => {
    const dates = session.rows.map((r) => r.start_date).filter(Boolean).sort()
    return dates[0] ?? ''
  }, [session])
  const endDate = useMemo(() => {
    const dates = session.rows.map((r) => r.end_date).filter(Boolean).sort()
    return dates[dates.length - 1] ?? ''
  }, [session])

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text">
        <ArrowLeft className="w-4 h-4" />
        세션 목록
      </button>

      <div>
        <h3 className="text-base font-semibold text-at-text">
          {formatDayHeader(day)} {formatTime(session.startedAt)} 세션
        </h3>
        <p className="text-xs text-at-text-secondary mt-0.5">
          {strategies.length}전략 × {tickers.length}종목 = {session.rows.length}건 백테스트
        </p>
      </div>

      <CompareResultsView
        results={results}
        tickers={tickers}
        strategies={strategies}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  )
}
