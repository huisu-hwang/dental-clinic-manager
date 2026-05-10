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

import type { BacktestMetrics, BacktestTrade, EquityCurvePoint, Market } from '@/types/investment'

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
        if (cur.runningTickers.size === 0) cur.done = true
        notify(strategyId)
      })
  }

  return job
}

/** 작업 결과만 클리어 (예: 사용자가 "새로 백테스트" 시작 직전). */
export function clearJob(strategyId: string) {
  jobs.delete(strategyId)
  notify(strategyId)
}
