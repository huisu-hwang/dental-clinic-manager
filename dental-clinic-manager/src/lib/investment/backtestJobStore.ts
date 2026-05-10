'use client'

/**
 * 백테스트 작업 글로벌 store
 *
 * 사용자가 백테스트 도중 다른 페이지로 이동했다가 돌아와도 결과를 잃지 않도록
 * 모듈 레벨에서 진행 중인 작업/완료된 결과를 보관한다.
 *
 * 동작:
 * - startJob: strategyId 별로 작업 등록. 각 ticker 별로 fetch 시작.
 * - 컴포넌트는 subscribe 로 결과 변경 알림 수신 → re-render
 * - fetch 는 컴포넌트 mount/unmount 와 무관하게 백그라운드 실행
 * - 새로고침 시에는 모듈 상태가 사라지지만, 진행 중 작업은 Vercel maxDuration(60s)
 *   안에 끝나므로 새로고침 후 backtest_runs 테이블에서 결과 복구 가능 (별도 흐름)
 */

import type {
  BacktestMetrics, BacktestTrade, EquityCurvePoint, Market,
} from '@/types/investment'
// Re-import (used in restoreFromStorage)
export type { BacktestMetrics, BacktestTrade } from '@/types/investment'

export interface BuyHoldData {
  totalReturn: number
  annualizedReturn: number
  equityCurve: EquityCurvePoint[]
}

export interface BacktestResultData {
  ticker: string
  tickerName?: string
  market: Market
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
  buyHold?: BuyHoldData
}

export interface BacktestJobParams {
  strategyId: string
  tickers: Array<{ ticker: string; name: string; market: Market }>
  startDate: string
  endDate: string
  initialCapital: number
}

export interface BacktestJob {
  /** 작업이 시작된 시각 (ms) — 새 작업이 시작되면 갱신 */
  startedAt: number
  params: BacktestJobParams
  /** 현재 진행 중인 ticker 들 */
  runningTickers: Set<string>
  /** 완료된 결과 (성공만) */
  results: BacktestResultData[]
  /** 실패한 ticker 들의 에러 메시지 */
  errors: string[]
  /** 모든 ticker 가 끝났는지 */
  done: boolean
}

type Listener = () => void

const jobs = new Map<string, BacktestJob>()
const listeners = new Map<string, Set<Listener>>()

// sessionStorage 키 포맷
const SS_KEY = 'backtest-jobs-v1'

interface PersistedJobMeta {
  strategyId: string
  startedAt: number
  params: BacktestJobParams
  /** DB 폴링이 아직 진행 중인 ticker 들 */
  pendingTickers: string[]
}

function loadPersisted(): Record<string, PersistedJobMeta> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(SS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, PersistedJobMeta>
  } catch {
    return {}
  }
}

function savePersisted(map: Record<string, PersistedJobMeta>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SS_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

function persistJob(strategyId: string, job: BacktestJob) {
  const all = loadPersisted()
  all[strategyId] = {
    strategyId,
    startedAt: job.startedAt,
    params: job.params,
    pendingTickers: Array.from(job.runningTickers),
  }
  savePersisted(all)
}

function clearPersisted(strategyId: string) {
  const all = loadPersisted()
  if (all[strategyId]) {
    delete all[strategyId]
    savePersisted(all)
  }
}

function notify(strategyId: string) {
  const set = listeners.get(strategyId)
  if (!set) return
  for (const cb of set) {
    try { cb() } catch { /* ignore */ }
  }
}

export function getJob(strategyId: string): BacktestJob | undefined {
  return jobs.get(strategyId)
}

export function subscribe(strategyId: string, listener: Listener): () => void {
  let set = listeners.get(strategyId)
  if (!set) {
    set = new Set()
    listeners.set(strategyId, set)
  }
  set.add(listener)
  return () => {
    const s = listeners.get(strategyId)
    if (!s) return
    s.delete(listener)
    if (s.size === 0) listeners.delete(strategyId)
  }
}

/** 진행 중 작업이 있어도 새 작업으로 덮어쓰며 시작 (사용자가 명시적으로 재실행) */
export function startJob(params: BacktestJobParams): BacktestJob {
  const { strategyId, tickers, startDate, endDate, initialCapital } = params

  const job: BacktestJob = {
    startedAt: Date.now(),
    params,
    runningTickers: new Set(tickers.map(t => t.ticker)),
    results: [],
    errors: [],
    done: tickers.length === 0,
  }
  jobs.set(strategyId, job)
  persistJob(strategyId, job)
  notify(strategyId)

  // 각 ticker 별 fetch 실행 — Promise 는 모듈 레벨이라 컴포넌트 unmount 영향 없음
  for (const entry of tickers) {
    fetch('/api/investment/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        ticker: entry.ticker,
        market: entry.market,
        startDate,
        endDate,
        initialCapital,
      }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        // 백테스트가 진행되는 동안 사용자가 새 백테스트를 시작했다면 startedAt 이 바뀜 — 옛 결과 무시
        const cur = jobs.get(strategyId)
        if (!cur || cur.startedAt !== job.startedAt) return

        if (!res.ok) {
          cur.errors.push(`${entry.ticker}: ${json.error || res.statusText}`)
        } else {
          const data = json.data
          if (data && (data.metrics || data.full_metrics)) {
            cur.results.push({
              ticker: entry.ticker,
              tickerName: entry.name,
              market: entry.market,
              metrics: data.metrics || data.full_metrics,
              trades: data.trades || [],
              equityCurve: data.equityCurve || data.equity_curve || [],
              buyHold: data.buyHold || data.buy_hold || undefined,
            })
            // 결과 정렬 — 수익률 내림차순
            cur.results.sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn)
          }
        }
      })
      .catch((err) => {
        const cur = jobs.get(strategyId)
        if (!cur || cur.startedAt !== job.startedAt) return
        const reason = err instanceof Error ? err.message : '네트워크 오류'
        cur.errors.push(`${entry.ticker}: ${reason}`)
      })
      .finally(() => {
        const cur = jobs.get(strategyId)
        if (!cur || cur.startedAt !== job.startedAt) return
        cur.runningTickers.delete(entry.ticker)
        if (cur.runningTickers.size === 0) {
          cur.done = true
          clearPersisted(strategyId)
        } else {
          persistJob(strategyId, cur)
        }
        notify(strategyId)
      })
  }

  return job
}

/**
 * 새로고침/탭 종료 후 다시 진입했을 때 sessionStorage 의 진행 중 잡을 DB 폴링으로 복구.
 * Vercel function 은 클라이언트 disconnect 후에도 maxDuration 까지 실행되므로
 * 백테스트 결과는 backtest_runs 에 저장됨 → 폴링으로 회수 가능.
 */
export function restoreFromStorage(strategyId: string): BacktestJob | undefined {
  // 이미 in-memory 잡이 있으면 그대로 사용
  const existing = jobs.get(strategyId)
  if (existing) return existing

  const all = loadPersisted()
  const meta = all[strategyId]
  if (!meta) return undefined

  // 너무 오래된 잡은 stale 로 간주 (3분 timeout)
  const ageMs = Date.now() - meta.startedAt
  if (ageMs > 3 * 60_000) {
    clearPersisted(strategyId)
    return undefined
  }

  // in-memory 잡 재생성 (DB 폴링 모드)
  const job: BacktestJob = {
    startedAt: meta.startedAt,
    params: meta.params,
    runningTickers: new Set(meta.pendingTickers),
    results: [],
    errors: [],
    done: meta.pendingTickers.length === 0,
  }
  jobs.set(strategyId, job)
  notify(strategyId)

  if (meta.pendingTickers.length === 0) return job

  // 백그라운드 폴링 시작 — 5초마다 결과 확인, 최대 90초
  const pollIntervalMs = 5_000
  const pollTimeoutMs = 90_000
  const startedAt = meta.startedAt
  const sinceIso = new Date(meta.startedAt - 1000).toISOString() // 1초 여유
  const tickersParam = meta.pendingTickers.join(',')
  const market = meta.params.tickers[0]?.market

  const poll = async () => {
    const cur = jobs.get(strategyId)
    if (!cur || cur.startedAt !== startedAt) return

    try {
      const res = await fetch(
        `/api/investment/backtest/results?strategyId=${encodeURIComponent(strategyId)}` +
          `&tickers=${encodeURIComponent(tickersParam)}` +
          (market ? `&market=${market}` : '') +
          `&since=${encodeURIComponent(sinceIso)}`,
        { cache: 'no-store' },
      )
      if (res.ok) {
        const json = await res.json().catch(() => ({}))
        const items = (json.data ?? []) as Array<{
          ticker: string
          market: 'KR' | 'US'
          metrics?: BacktestMetrics
          trades?: BacktestTrade[]
          equityCurve?: EquityCurvePoint[]
        }>
        const tickerNameMap = new Map(meta.params.tickers.map(t => [t.ticker, t.name]))
        for (const it of items) {
          if (!cur.runningTickers.has(it.ticker)) continue
          if (!it.metrics) continue
          cur.results.push({
            ticker: it.ticker,
            tickerName: tickerNameMap.get(it.ticker) || it.ticker,
            market: it.market,
            metrics: it.metrics,
            trades: it.trades ?? [],
            equityCurve: it.equityCurve ?? [],
          })
          cur.runningTickers.delete(it.ticker)
        }
        cur.results.sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn)
        if (cur.runningTickers.size === 0) {
          cur.done = true
          clearPersisted(strategyId)
        } else {
          persistJob(strategyId, cur)
        }
        notify(strategyId)
      }
    } catch {
      /* 일시 네트워크 오류 — 다음 tick 에서 재시도 */
    }

    // 계속 폴링
    if (cur.runningTickers.size > 0 && Date.now() - startedAt < pollTimeoutMs) {
      setTimeout(poll, pollIntervalMs)
    } else if (cur.runningTickers.size > 0) {
      // timeout
      for (const t of cur.runningTickers) {
        cur.errors.push(`${t}: 결과 폴링 시간 초과 (서버 측 백테스트가 완료되지 않았거나 실패)`)
      }
      cur.runningTickers.clear()
      cur.done = true
      clearPersisted(strategyId)
      notify(strategyId)
    }
  }

  setTimeout(poll, pollIntervalMs) // 첫 폴링은 5초 후 (서버에 결과 도착할 시간)
  return job
}

/** 작업 결과만 클리어 (예: 사용자가 "새로 백테스트" 시작 직전). */
export function clearJob(strategyId: string) {
  jobs.delete(strategyId)
  notify(strategyId)
}
