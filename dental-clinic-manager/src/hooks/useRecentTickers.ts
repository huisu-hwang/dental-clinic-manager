'use client'

/**
 * 사용자가 입력했던 종목을 localStorage에 보관 → 다른 페이지에서 빠른 추가 버튼으로 활용.
 * 모든 종목 입력 페이지(전략관리/단타/비교/스마트머니)에서 통합 사용.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Market } from '@/types/investment'

export interface RecentTicker {
  ticker: string
  name: string
  market: Market
  /** 마지막 사용 시각 (ms) — 정렬용 */
  lastUsed: number
}

const STORAGE_KEY = 'dcm.recentTickers.v1'
const MAX_ITEMS = 24
const STORAGE_EVENT = 'dcm:recent-tickers-changed'

function readStorage(): RecentTicker[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 스키마 정합성 + 최신순
    return parsed
      .filter((x): x is RecentTicker =>
        x && typeof x.ticker === 'string' && typeof x.name === 'string'
        && (x.market === 'KR' || x.market === 'US')
        && typeof x.lastUsed === 'number',
      )
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function writeStorage(items: RecentTicker[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    // 같은 탭의 다른 hook 인스턴스 동기화용 — 'storage' 이벤트는 다른 탭만 발생
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
  } catch {
    /* quota exceeded 등 — 무시 */
  }
}

export function useRecentTickers(): {
  items: RecentTicker[]
  add: (ticker: string, name: string, market: Market) => void
  remove: (ticker: string, market: Market) => void
  clear: () => void
} {
  const [items, setItems] = useState<RecentTicker[]>(() => readStorage())

  // 다른 탭/같은 탭의 다른 인스턴스 변경 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setItems(readStorage())
    window.addEventListener('storage', sync)
    window.addEventListener(STORAGE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(STORAGE_EVENT, sync)
    }
  }, [])

  const add = useCallback((ticker: string, name: string, market: Market) => {
    if (!ticker || (market !== 'KR' && market !== 'US')) return
    const tickerUpper = ticker.trim().toUpperCase()
    if (!tickerUpper) return
    const cleanName = (name && name.trim()) || tickerUpper
    setItems((prev) => {
      const filtered = prev.filter((x) => !(x.ticker === tickerUpper && x.market === market))
      const next = [{ ticker: tickerUpper, name: cleanName, market, lastUsed: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
      writeStorage(next)
      return next
    })
  }, [])

  const remove = useCallback((ticker: string, market: Market) => {
    setItems((prev) => {
      const next = prev.filter((x) => !(x.ticker === ticker.toUpperCase() && x.market === market))
      writeStorage(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setItems([])
    writeStorage([])
  }, [])

  return { items, add, remove, clear }
}
