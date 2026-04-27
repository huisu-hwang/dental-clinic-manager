'use client'

/**
 * ScannerContext — 종목 스크리너 백그라운드 스캔 상태 공유
 *
 * 사용자가 다른 메뉴로 이동해도 스캔이 백그라운드에서 계속되도록
 * App Root 수준에서 한 번만 마운트되는 Provider.
 *
 * 청크(10개) 단위로 `/api/investment/screener/batch`를 순차 호출하며,
 * 진행률/누적 결과를 상태로 노출. AbortController로 중간 취소 지원.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'

import type { ConditionGroup, IndicatorConfig, Market } from '@/types/investment'

// ============================================
// 도메인 타입
// ============================================

export interface ScreenerMatch {
  ticker: string
  market: Market
  name: string
  asOfDate: string
  price: number
  matchedConditions: string[]
  indicators: Record<string, number | Record<string, number>>
}

export interface FailedEntry {
  ticker: string
  market: Market
  reason: string
}

export interface StrategyPresetPayload {
  name?: string
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
}

export interface StrategyPayload {
  strategyId?: string
  preset?: StrategyPresetPayload
}

export interface TickerInput {
  ticker: string
  market: Market
  name: string
}

export type ScannerStatus =
  | 'idle'
  | 'scanning'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface ScannerJob {
  id: string
  startedAt: number
  finishedAt?: number
  status: ScannerStatus
  universe: string // UniverseId
  universeLabel: string
  realtime: boolean
  asOfDate: string
  total: number
  processed: number
  currentTickers: string[]
  matchesByStrategy: Record<string, ScreenerMatch[]>
  failedByStrategy: Record<string, FailedEntry[]>
  strategyKeys: string[]
  strategyNames: Record<string, string>
  error?: string
}

export interface StartScanInput {
  strategies: StrategyPayload[]
  strategyDisplayNames: string[]
  asOfDate: string
  realtime: boolean
  universe: string
  universeLabel: string
  tickers: TickerInput[]
}

interface ScannerContextValue {
  job: ScannerJob | null
  startScan: (input: StartScanInput) => Promise<void>
  cancelScan: () => void
  resetJob: () => void
}

// ============================================
// 백엔드 응답 타입 (서버 응답 형태에 맞춤)
// ============================================

interface BatchStrategyResult {
  strategyKey: string
  strategyName: string
  matches: ScreenerMatch[]
  failed: FailedEntry[]
}

interface BatchResponseData {
  asOfDate: string
  realtime: boolean
  processed: Array<{ ticker: string; market: Market }>
  strategies: BatchStrategyResult[]
}

interface BatchResponse {
  data?: BatchResponseData
  error?: string
}

// ============================================
// Context 정의
// ============================================

const ScannerContext = createContext<ScannerContextValue | null>(null)

export const useScanner = (): ScannerContextValue => {
  const ctx = useContext(ScannerContext)
  if (!ctx) {
    throw new Error('useScanner must be used inside ScannerProvider')
  }
  return ctx
}

const CHUNK_SIZE = 10
/** 실패한 종목 정보는 전략별 30개까지만 누적 (UI 폭주 방지) */
const FAILED_ENTRIES_LIMIT = 30

// ============================================
// Provider
// ============================================

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<ScannerJob | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const startScan = useCallback(async (input: StartScanInput) => {
    // 1. 이전 스캔이 진행 중이면 abort
    if (abortRef.current) {
      try {
        abortRef.current.abort()
      } catch {
        // ignore
      }
    }
    cancelledRef.current = false
    const controller = new AbortController()
    abortRef.current = controller

    // 2. 초기 job 세팅
    const id = `scan-${Date.now()}`
    const initial: ScannerJob = {
      id,
      startedAt: Date.now(),
      status: 'scanning',
      universe: input.universe,
      universeLabel: input.universeLabel,
      realtime: input.realtime,
      asOfDate: input.asOfDate,
      total: input.tickers.length,
      processed: 0,
      currentTickers: [],
      matchesByStrategy: {},
      failedByStrategy: {},
      strategyKeys: [],
      strategyNames: {},
    }
    setJob(initial)

    // 3. 청크 순차 fetch
    try {
      for (let i = 0; i < input.tickers.length; i += CHUNK_SIZE) {
        if (cancelledRef.current) break
        const chunk = input.tickers.slice(i, i + CHUNK_SIZE)

        setJob(prev =>
          prev
            ? { ...prev, currentTickers: chunk.map(t => t.ticker) }
            : prev,
        )

        const res = await fetch('/api/investment/screener/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            strategies: input.strategies,
            asOfDate: input.asOfDate,
            realtime: input.realtime,
            tickers: chunk,
          }),
        })

        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`
          try {
            const errJson = (await res.json()) as { error?: string }
            if (errJson?.error) errMsg = errJson.error
          } catch {
            // ignore parse error
          }
          throw new Error(errMsg)
        }

        const json = (await res.json()) as BatchResponse
        const data = json.data
        if (!data) {
          throw new Error(json.error || '빈 응답')
        }

        setJob(prev => {
          if (!prev) return prev
          const matchesByStrategy: Record<string, ScreenerMatch[]> = {
            ...prev.matchesByStrategy,
          }
          const failedByStrategy: Record<string, FailedEntry[]> = {
            ...prev.failedByStrategy,
          }
          const strategyNames: Record<string, string> = {
            ...prev.strategyNames,
          }
          const strategyKeys = prev.strategyKeys.length
            ? prev.strategyKeys
            : data.strategies.map(s => s.strategyKey)

          for (const s of data.strategies) {
            strategyNames[s.strategyKey] = s.strategyName
            matchesByStrategy[s.strategyKey] = [
              ...(matchesByStrategy[s.strategyKey] || []),
              ...s.matches,
            ]
            failedByStrategy[s.strategyKey] = [
              ...(failedByStrategy[s.strategyKey] || []),
              ...s.failed,
            ].slice(0, FAILED_ENTRIES_LIMIT)
          }

          return {
            ...prev,
            processed: prev.processed + data.processed.length,
            currentTickers: [],
            matchesByStrategy,
            failedByStrategy,
            strategyKeys,
            strategyNames,
          }
        })
      }

      if (!cancelledRef.current) {
        setJob(prev =>
          prev
            ? {
                ...prev,
                status: 'completed',
                finishedAt: Date.now(),
                currentTickers: [],
              }
            : prev,
        )
      } else {
        setJob(prev =>
          prev
            ? {
                ...prev,
                status: 'cancelled',
                finishedAt: Date.now(),
                currentTickers: [],
              }
            : prev,
        )
      }
    } catch (err) {
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        cancelledRef.current
      if (isAbort) {
        setJob(prev =>
          prev
            ? {
                ...prev,
                status: 'cancelled',
                finishedAt: Date.now(),
                currentTickers: [],
              }
            : prev,
        )
      } else {
        const message = err instanceof Error ? err.message : '스캔 실패'
        setJob(prev =>
          prev
            ? {
                ...prev,
                status: 'error',
                error: message,
                finishedAt: Date.now(),
                currentTickers: [],
              }
            : prev,
        )
      }
    }
  }, [])

  const cancelScan = useCallback(() => {
    cancelledRef.current = true
    if (abortRef.current) {
      try {
        abortRef.current.abort()
      } catch {
        // ignore
      }
    }
  }, [])

  const resetJob = useCallback(() => {
    cancelledRef.current = true
    if (abortRef.current) {
      try {
        abortRef.current.abort()
      } catch {
        // ignore
      }
    }
    setJob(null)
  }, [])

  return (
    <ScannerContext.Provider value={{ job, startScan, cancelScan, resetJob }}>
      {children}
    </ScannerContext.Provider>
  )
}
