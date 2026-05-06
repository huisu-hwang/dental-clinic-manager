'use client'

/**
 * 사용자 즐겨찾기 종목 — 서버(Supabase)에 영속.
 * 5개 페이지(전략관리/단타/전략비교/스크리너/스마트머니)와 TickerInfoModal에서 공통 사용.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Market } from '@/types/investment'

export interface Favorite {
  ticker: string
  market: Market
  tickerName: string | null
  createdAt: string
}

const BROADCAST_CHANNEL = 'dcm-favorites-v1'

interface ListResponse {
  items?: Favorite[]
  error?: string
}

export function useFavorites(): {
  favorites: Favorite[]
  loading: boolean
  error: string | null
  add: (ticker: string, market: Market, tickerName?: string | null) => Promise<void>
  remove: (ticker: string, market: Market) => Promise<void>
  isFavorite: (ticker: string, market: Market) => boolean
  refresh: () => Promise<void>
} {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/investment/favorites', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          setFavorites([])
          return
        }
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? 'fetch failed')
      }
      const data: ListResponse = await res.json()
      setFavorites(data.items ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
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
    try {
      channelRef.current?.postMessage('changed')
    } catch { /* noop */ }
  }, [])

  const add = useCallback(async (ticker: string, market: Market, tickerName?: string | null) => {
    const t = (ticker ?? '').trim().toUpperCase()
    if (!t || (market !== 'KR' && market !== 'US')) return
    const already = favorites.some((f) => f.ticker === t && f.market === market)
    if (already) return
    const optimistic: Favorite = {
      ticker: t,
      market,
      tickerName: tickerName ?? t,
      createdAt: new Date().toISOString(),
    }
    setFavorites((prev) => [optimistic, ...prev])
    try {
      const res = await fetch('/api/investment/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, market, ticker_name: tickerName ?? null }),
      })
      if (!res.ok) {
        setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? '저장 실패')
        return
      }
      broadcast()
    } catch (e: unknown) {
      setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
      const msg = e instanceof Error ? e.message : '저장 실패'
      setError(msg)
    }
  }, [favorites, broadcast])

  const remove = useCallback(async (ticker: string, market: Market) => {
    const t = (ticker ?? '').trim().toUpperCase()
    if (!t || (market !== 'KR' && market !== 'US')) return
    const before = favorites
    setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
    try {
      const res = await fetch(`/api/investment/favorites?ticker=${encodeURIComponent(t)}&market=${market}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setFavorites(before)
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? '삭제 실패')
        return
      }
      broadcast()
    } catch (e: unknown) {
      setFavorites(before)
      const msg = e instanceof Error ? e.message : '삭제 실패'
      setError(msg)
    }
  }, [favorites, broadcast])

  const isFavorite = useCallback((ticker: string, market: Market) => {
    const t = (ticker ?? '').trim().toUpperCase()
    return favorites.some((f) => f.ticker === t && f.market === market)
  }, [favorites])

  return { favorites, loading, error, add, remove, isFavorite, refresh }
}
