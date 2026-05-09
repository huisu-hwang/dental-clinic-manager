'use client'

/**
 * 즐겨찾기 종목을 버튼으로 노출 — RecentTickersButtons 위에 배치.
 * 클릭 시 onSelect 호출 (자동 검색/추가는 호출자 책임).
 */

import { Plus, Star, X } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import type { Market } from '@/types/investment'

interface Props {
  /** 'ALL' = KR/US 모두, 'KR' / 'US' = 해당 시장만 */
  market?: 'KR' | 'US' | 'ALL'
  /** 클릭 시 호출 — 부모가 폼 입력란에 채움 */
  onSelect: (ticker: string, name: string, market: Market) => void
  /** 이미 추가된 항목 키 (`${market}:${ticker}` 형식) — disabled 처리 */
  excludeKeys?: Set<string>
  /** 노출 최대 개수 (default 24) */
  limit?: number
  /** 작은 버튼 모드 */
  compact?: boolean
  /** 라벨 */
  label?: string
}

export default function FavoritesButtons({
  market = 'ALL',
  onSelect,
  excludeKeys,
  limit = 24,
  compact = false,
  label = '즐겨찾기',
}: Props) {
  const { favorites, loading, remove } = useFavorites()

  const filtered = favorites
    .filter((f) => market === 'ALL' || f.market === market)
    .slice(0, limit)

  if (loading && favorites.length === 0) return null
  if (filtered.length === 0) return null

  return (
    <div className="flex flex-nowrap sm:flex-wrap gap-1.5 items-center overflow-x-auto sm:overflow-visible -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 sm:pb-0 scrollbar-thin">
      <span className="text-xs text-at-text-weak inline-flex items-center gap-1 mr-1 flex-shrink-0">
        <Star className="w-3 h-3 text-amber-500" />
        {label}:
      </span>
      {filtered.map((it) => {
        const key = `${it.market}:${it.ticker}`
        const already = excludeKeys?.has(key) === true
        const display = it.tickerName ?? it.ticker
        return (
          <span
            key={key}
            className={`inline-flex items-center rounded text-xs flex-shrink-0 ${
              compact
                ? 'px-1.5 py-0.5 bg-amber-50 text-at-text-secondary border border-amber-200/60'
                : 'px-2 py-1 bg-amber-50 text-at-text-secondary border border-amber-200/60'
            } ${already ? 'opacity-40' : ''}`}
          >
            <button
              type="button"
              onClick={() => { if (!already) onSelect(it.ticker, display, it.market) }}
              disabled={already}
              title={`${display} (${it.ticker})${already ? ' · 이미 추가됨' : ''}`}
              className={`inline-flex items-center gap-1 ${already ? 'cursor-not-allowed' : 'hover:text-at-accent'}`}
            >
              <Plus className="w-3 h-3" />
              <span className={`text-[9px] px-1 rounded font-bold ${it.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {it.market}
              </span>
              <span className="truncate max-w-[110px]">{display}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(it.ticker, it.market) }}
              title="즐겨찾기에서 제거"
              className="ml-1 text-at-text-weak hover:text-rose-500"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}
    </div>
  )
}
