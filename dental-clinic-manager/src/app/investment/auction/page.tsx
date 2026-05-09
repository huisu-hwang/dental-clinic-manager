'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AuctionFilters } from '@/components/Investment/Auction/AuctionFilters'
import { AuctionCard } from '@/components/Investment/Auction/AuctionCard'
import type { AuctionItem, MarketPrice } from '@/types/auction'

type Row = AuctionItem & { market: MarketPrice | null }

export default function AuctionListPage() {
  const sp = useSearchParams()
  const [items, setItems] = useState<Row[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<number | null>(0)

  const load = useCallback(async (c: number | null) => {
    if (c === null) return
    setLoading(true)
    const params = new URLSearchParams(sp.toString())
    params.set('cursor', String(c))
    const r = await fetch(`/api/auction/items?${params}`)
    const j = await r.json()
    setItems(prev => c === 0 ? j.items : [...prev, ...j.items])
    setTotal(j.total)
    setCursor(j.nextCursor)
    setLoading(false)
  }, [sp])

  useEffect(() => { load(0) }, [load])

  useEffect(() => {
    fetch('/api/auction/favorites').then(r => r.json()).then(j => {
      setFavorites(new Set((j.items ?? []).map((x: { item_id: string }) => x.item_id)))
    }).catch(() => {})
  }, [])

  const onToggleFavorite = async (itemId: string) => {
    const isFav = favorites.has(itemId)
    setFavorites(prev => {
      const next = new Set(prev)
      isFav ? next.delete(itemId) : next.add(itemId)
      return next
    })
    await fetch('/api/auction/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">부동산 경매 ({new Intl.NumberFormat('ko-KR').format(total)}건)</h1>
        <Link href="/investment/auction/favorites" className="text-sm text-at-accent hover:underline">⭐ 관심물건</Link>
      </div>

      <AuctionFilters />

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <AuctionCard
              key={item.id}
              item={item}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}

      {cursor !== null && !loading && items.length > 0 && (
        <div className="text-center mt-6">
          <button
            onClick={() => load(cursor)}
            className="px-4 py-2 rounded-xl bg-at-surface hover:bg-at-surface-hover border border-at-border"
          >
            더 보기
          </button>
        </div>
      )}
    </div>
  )
}
