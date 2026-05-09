'use client'

/**
 * 사용자가 입력했던 종목을 서버(Supabase `investment_recent_tickers`)에 영속.
 * 모든 종목 입력 페이지(전략관리/단타/비교/스마트머니)에서 통합 사용.
 *
 * 디바이스/브라우저에 무관하게 계정 단위로 동일하게 유지된다.
 * 이전 localStorage(`dcm.recentTickers.v1`) 데이터는 첫 로드 시 1회 서버에 업로드 후 정리.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Market } from '@/types/investment'

export interface RecentTicker {
  ticker: string
  name: string
  market: Market
  /** 마지막 사용 시각 (ms) */
  lastUsed: number
}

const LEGACY_STORAGE_KEY = 'dcm.recentTickers.v1'
const MIGRATION_FLAG_KEY = 'dcm.recentTickers.migratedAt'
const BROADCAST_CHANNEL = 'dcm-recent-tickers-v1'

interface ListResponse {
  items?: RecentTicker[]
  error?: string
}

function readLegacy(): RecentTicker[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is RecentTicker =>
      x && typeof x.ticker === 'string' && typeof x.name === 'string'
      && (x.market === 'KR' || x.market === 'US')
      && typeof x.lastUsed === 'number',
    )
  } catch {
    return []
  }
}

export function useRecentTickers(): {
  items: RecentTicker[]
  loading: boolean
  add: (ticker: string, name: string, market: Market) => void
  remove: (ticker: string, market: Market) => void
  clear: () => void
  refresh: () => Promise<void>
} {
  const [items, setItems] = useState<RecentTicker[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const migratedRef = useRef<boolean>(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/recent-tickers', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) setItems([])
        return
      }
      const data: ListResponse = await res.json()
      setItems(data.items ?? [])
    } catch {
      /* 네트워크 오류 — 무시 (다음 호출에서 복구) */
    } finally {
      setLoading(false)
    }
  }, [])

  // 첫 마운트 시: legacy localStorage → 서버 1회 업로드 후 정리, 그리고 서버에서 목록 로드
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (typeof window !== 'undefined' && !migratedRef.current) {
        migratedRef.current = true
        const legacy = readLegacy()
        const alreadyMigrated = window.localStorage.getItem(MIGRATION_FLAG_KEY)
        if (legacy.length > 0 && !alreadyMigrated) {
          try {
            const res = await fetch('/api/investment/recent-tickers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: legacy.map((it) => ({
                  ticker: it.ticker,
                  market: it.market,
                  ticker_name: it.name,
                  last_used_at: new Date(it.lastUsed).toISOString(),
                })),
              }),
            })
            if (res.ok) {
              window.localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString())
              window.localStorage.removeItem(LEGACY_STORAGE_KEY)
            }
          } catch { /* 다음 마운트에서 재시도 */ }
        } else if (legacy.length === 0 && !alreadyMigrated) {
          window.localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString())
        }
      }
      if (!cancelled) await refresh()
    })()
    return () => { cancelled = true }
  }, [refresh])

  // 다른 탭/같은 탭의 다른 인스턴스 변경 동기화
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(BROADCAST_CHANNEL)
    channelRef.current = ch
    ch.onmessage = (ev) => {
      if (ev?.data === 'changed') refresh()
    }
    return () => {
      ch.close()
      channelRef.current = null
    }
  }, [refresh])

  const broadcast = useCallback(() => {
    try { channelRef.current?.postMessage('changed') } catch { /* noop */ }
  }, [])

  const add = useCallback((ticker: string, name: string, market: Market) => {
    if (!ticker || (market !== 'KR' && market !== 'US')) return
    const tickerUpper = ticker.trim().toUpperCase()
    if (!tickerUpper) return
    const cleanName = (name && name.trim()) || tickerUpper

    // optimistic — UI 즉시 반영
    setItems((prev) => {
      const filtered = prev.filter((x) => !(x.ticker === tickerUpper && x.market === market))
      return [{ ticker: tickerUpper, name: cleanName, market, lastUsed: Date.now() }, ...filtered]
    })

    // 서버 동기화 (fire-and-forget)
    void (async () => {
      try {
        const res = await fetch('/api/investment/recent-tickers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: tickerUpper, market, ticker_name: cleanName }),
        })
        if (res.ok) broadcast()
      } catch { /* 무시 */ }
    })()
  }, [broadcast])

  const remove = useCallback((ticker: string, market: Market) => {
    if (!ticker) return
    const tickerUpper = ticker.toUpperCase()
    const before = items
    setItems((prev) => prev.filter((x) => !(x.ticker === tickerUpper && x.market === market)))
    void (async () => {
      try {
        const res = await fetch(`/api/investment/recent-tickers?ticker=${encodeURIComponent(tickerUpper)}&market=${market}`, {
          method: 'DELETE',
        })
        if (res.ok) broadcast()
        else setItems(before)
      } catch { setItems(before) }
    })()
  }, [items, broadcast])

  const clear = useCallback(() => {
    const before = items
    setItems([])
    void (async () => {
      try {
        await Promise.all(before.map((it) =>
          fetch(`/api/investment/recent-tickers?ticker=${encodeURIComponent(it.ticker)}&market=${it.market}`, { method: 'DELETE' }),
        ))
        broadcast()
      } catch { /* 무시 */ }
    })()
  }, [items, broadcast])

  return { items, loading, add, remove, clear, refresh }
}
