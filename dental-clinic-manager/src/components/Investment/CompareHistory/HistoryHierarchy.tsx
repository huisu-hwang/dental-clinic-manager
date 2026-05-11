'use client'

/**
 * 백테스트 히스토리 세션 리스트 + 세션 결과 화면.
 *
 *  Level 1 (리스트): 세션 카드 — 시각·종목 수·기간·대표 종목만 표시
 *  Level 2 (상세):  CompareResultsView 재사용 — 최초 비교 실행 후 보던 매트릭스·비교표 동일
 *
 * 사용자 요청: 수익률 등 큰 의미없는 숫자는 리스트에서 빼고, 세션 단위로만 깔끔히 노출.
 */

import { useEffect, useMemo, useState } from 'react'
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
  /** 비교용 다중 선택은 더 이상 리스트 단에서 노출하지 않지만, 향후 확장 위해 prop은 유지 */
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}

/**
 * backtest_runs row → CompareResultsView가 기대하는 BacktestResultItem 변환.
 * rowKey 형식은 라이브 비교(`<strategyKey>::<ticker>`)와 정확히 일치시켜야 매트릭스 셀이 채워진다.
 */
function toResultItem(r: BacktestRunRow, strategyName: string): BacktestResultItem {
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
  const strategyKey = r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`
  return {
    rowKey: `${strategyKey}::${r.ticker.toUpperCase()}`,
    strategyId: strategyKey,
    strategyName,
    ticker: r.ticker,
    tickerName: r.ticker,
    metrics,
    trades,
    equityCurve,
  }
}

interface SessionGroup {
  id: string
  day: string         // YYYY-MM-DD
  startedAt: string   // ISO
  rows: BacktestRunRow[]
}

const SESSION_GAP_MS = 60 * 1000 // 60초 이내 인접 row는 같은 세션

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const formatDayHeader = (yyyymmdd: string): string => {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${WEEKDAYS[dt.getUTCDay()]})`
}

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso.slice(11, 16)
  }
}

const periodDays = (start: string, end: string): number | null => {
  if (!start || !end) return null
  const s = Date.parse(start)
  const e = Date.parse(end)
  if (Number.isNaN(s) || Number.isNaN(e)) return null
  return Math.max(0, Math.round((e - s) / 86_400_000))
}

const formatPeriod = (days: number | null): string => {
  if (days == null) return '기간 정보 없음'
  if (days >= 365) {
    const years = days / 365
    return years % 1 < 0.05 ? `${Math.round(years)}년` : `${years.toFixed(1)}년`
  }
  if (days >= 30) return `${Math.round(days / 30)}개월`
  return `${days}일`
}

export default function HistoryHierarchy({ rows, strategies }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const strategyById = useMemo(() => {
    const m = new Map<string, StrategyOption>()
    for (const s of strategies) m.set(s.id, s)
    return m
  }, [strategies])

  // 세션 평면 리스트 (날짜별 묶음은 렌더링 시 headers만 끼움)
  const sessions: SessionGroup[] = useMemo(() => {
    const byDay = new Map<string, BacktestRunRow[]>()
    for (const r of rows) {
      const day = (r.executed_at ?? '').slice(0, 10)
      if (!day) continue
      const arr = byDay.get(day) ?? []
      arr.push(r)
      byDay.set(day, arr)
    }
    const all: SessionGroup[] = []
    for (const [day, dayRows] of byDay) {
      const sorted = [...dayRows].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
      let bucket: BacktestRunRow[] = []
      let lastTs = 0
      const flush = () => {
        if (bucket.length === 0) return
        all.push({
          id: `${bucket[0].id}:${bucket[0].executed_at}`,
          day,
          startedAt: bucket[0].executed_at,
          rows: bucket,
        })
        bucket = []
      }
      for (const r of sorted) {
        const ts = new Date(r.executed_at).getTime()
        if (bucket.length === 0 || ts - lastTs <= SESSION_GAP_MS) {
          bucket.push(r)
        } else {
          flush()
          bucket.push(r)
        }
        lastTs = ts
      }
      flush()
    }
    // 최근 세션 먼저
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [rows])

  // ========= 상세: 세션 결과 매트릭스 =========
  if (selectedSessionId) {
    const session = sessions.find((s) => s.id === selectedSessionId)
    if (!session) {
      return (
        <div className="space-y-3">
          <button
            onClick={() => setSelectedSessionId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text"
          >
            <ArrowLeft className="w-4 h-4" />
            세션 목록
          </button>
          <p className="text-sm text-at-text-secondary">세션을 찾을 수 없습니다.</p>
        </div>
      )
    }
    return (
      <SessionResultView
        session={session}
        strategyById={strategyById}
        onBack={() => setSelectedSessionId(null)}
      />
    )
  }

  // ========= 리스트 =========
  if (sessions.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-xs text-at-text-secondary">
        총 {sessions.length}개 세션
      </p>
      <div className="space-y-2">
        {sessions.map((s, idx) => {
          // 이전 세션과 날짜가 바뀌면 날짜 헤더 렌더링
          const prev = sessions[idx - 1]
          const showDayHeader = !prev || prev.day !== s.day
          return (
            <div key={s.id}>
              {showDayHeader && (
                <div className="px-1 pt-2 pb-1 text-[11px] font-semibold text-at-text-secondary">
                  {formatDayHeader(s.day)}
                </div>
              )}
              <SessionCard session={s} onOpen={() => setSelectedSessionId(s.id)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SessionCard({ session, onOpen }: { session: SessionGroup; onOpen: () => void }) {
  // 대표 종목 1~2개
  const tickerList = useMemo(() => {
    const seen = new Set<string>()
    const arr: string[] = []
    for (const r of session.rows) {
      const t = r.ticker.toUpperCase()
      if (seen.has(t)) continue
      seen.add(t)
      arr.push(t)
    }
    return arr
  }, [session])

  const tickerCount = tickerList.length
  const sampleTickers = tickerList.slice(0, 2)
  const moreCount = Math.max(0, tickerCount - sampleTickers.length)

  // 같은 세션 안에서는 보통 start_date/end_date가 동일. 대표 1건 기준.
  const sample = session.rows[0]
  const days = sample ? periodDays(sample.start_date, sample.end_date) : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-at-border bg-white px-4 py-3 hover:border-at-accent hover:bg-at-surface-alt/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="font-semibold text-at-text font-mono">{formatTime(session.startedAt)}</span>
            <span className="text-at-text-secondary">·</span>
            <span className="text-at-text">
              <span className="font-semibold">{tickerCount}</span>
              <span className="text-at-text-secondary">종목</span>
            </span>
            <span className="text-at-text-secondary">·</span>
            <span className="text-at-text">{formatPeriod(days)}</span>
          </div>
          {sampleTickers.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {sampleTickers.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-at-surface-alt text-at-text-secondary"
                >
                  {t}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[11px] text-at-text-weak">외 {moreCount}종목</span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-at-text-weak flex-shrink-0" />
      </div>
    </button>
  )
}

function SessionResultView({
  session,
  strategyById,
  onBack,
}: {
  session: SessionGroup
  strategyById: Map<string, StrategyOption>
  onBack: () => void
}) {
  // 리스트는 light=1 로 jsonb 없이 로드된 상태 → 매트릭스·차트에 필요한 풀 데이터를 lazy fetch.
  const [fullRows, setFullRows] = useState<BacktestRunRow[]>(session.rows)
  const [loadingFull, setLoadingFull] = useState(false)
  const [fullError, setFullError] = useState<string | null>(null)

  useEffect(() => {
    // 이미 풀 데이터가 들어있다면(equity_curve 존재) skip — 새로 비교한 직후처럼
    const needFetch = session.rows.some(r => !r.equity_curve || !r.full_metrics)
    if (!needFetch) {
      setFullRows(session.rows)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    ;(async () => {
      setLoadingFull(true)
      setFullError(null)
      try {
        // 서버 cap이 50 → 50개씩 chunk로 끊어 병렬 호출 (한 세션이 264건 등 클 수 있음)
        const allIds = session.rows.map(r => r.id)
        const CHUNK = 50
        const chunks: string[][] = []
        for (let i = 0; i < allIds.length; i += CHUNK) {
          chunks.push(allIds.slice(i, i + CHUNK))
        }
        const responses = await Promise.all(
          chunks.map(async (ids) => {
            const params = new URLSearchParams({ ids: ids.join(',') })
            const r = await fetch(`/api/investment/backtest?${params.toString()}`, {
              signal: ctrl.signal,
              cache: 'no-store',
            })
            if (!r.ok) {
              const err = (await r.json().catch(() => ({}))) as { error?: string }
              throw new Error(err.error ?? `HTTP ${r.status}`)
            }
            const j = (await r.json()) as { data?: BacktestRunRow[] }
            return j.data ?? []
          }),
        )
        // light 응답에는 strategies join이 있지만 ids 응답엔 없음 — 라벨은 props 의 strategyById/preset_name 으로 충분
        const byId = new Map<string, BacktestRunRow>()
        for (const data of responses) {
          for (const x of data) byId.set(x.id, x)
        }
        // 원본 row와 병합 (id 매칭, 새 jsonb 우선)
        const merged = session.rows.map(orig => {
          const fresh = byId.get(orig.id)
          return fresh ? { ...orig, ...fresh } : orig
        })
        setFullRows(merged)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setFullError(msg.includes('aborted') ? '응답이 너무 오래 걸려요.' : msg)
      } finally {
        setLoadingFull(false)
        clearTimeout(timer)
      }
    })()
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [session])

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
    () => fullRows.map((r) => toResultItem(r, rowLabelOf(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullRows],
  )

  const tickers = useMemo(() => {
    const seen = new Set<string>()
    const arr: { ticker: string; name: string; market: 'KR' | 'US' }[] = []
    for (const r of fullRows) {
      const t = r.ticker.toUpperCase()
      const k = `${r.market}:${t}`
      if (seen.has(k)) continue
      seen.add(k)
      arr.push({ ticker: t, name: t, market: r.market })
    }
    return arr
  }, [fullRows])

  const strategies = useMemo(() => {
    const seen = new Set<string>()
    const arr: { key: string; name: string }[] = []
    for (const r of fullRows) {
      const key = r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`
      if (seen.has(key)) continue
      seen.add(key)
      arr.push({ key, name: rowLabelOf(r) })
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRows])

  const startDate = useMemo(() => {
    const dates = fullRows.map((r) => r.start_date).filter(Boolean).sort()
    return dates[0] ?? ''
  }, [fullRows])
  const endDate = useMemo(() => {
    const dates = fullRows.map((r) => r.end_date).filter(Boolean).sort()
    return dates[dates.length - 1] ?? ''
  }, [fullRows])

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text">
        <ArrowLeft className="w-4 h-4" />
        세션 목록
      </button>

      <div>
        <h3 className="text-base font-semibold text-at-text">
          {formatDayHeader(session.day)} {formatTime(session.startedAt)} 세션
        </h3>
        <p className="text-xs text-at-text-secondary mt-0.5">
          {strategies.length}전략 × {tickers.length}종목 = {session.rows.length}건 백테스트
        </p>
      </div>

      {fullError && (
        <div className="p-3 rounded-xl bg-at-error-bg text-at-error text-sm">
          상세 데이터 조회 실패: {fullError}
        </div>
      )}

      {loadingFull ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
        </div>
      ) : (
        <CompareResultsView
          results={results}
          tickers={tickers}
          strategies={strategies}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  )
}
