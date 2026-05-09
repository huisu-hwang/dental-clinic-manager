'use client'

/**
 * 과거 입력했던 종목들을 버튼으로 노출 — 모든 종목 입력 페이지의 TickerSearch 옆/아래에 배치.
 * 이미 추가된 종목은 disabled로 표시 (excludeKeys prop).
 */

import { Plus, History, X } from 'lucide-react'
import { useRecentTickers } from '@/hooks/useRecentTickers'
import type { Market } from '@/types/investment'

interface Props {
  /** 'ALL' = KR/US 모두, 'KR' / 'US' = 해당 시장만 */
  market?: 'KR' | 'US' | 'ALL'
  /** 클릭 시 호출 — 부모가 폼에 추가 */
  onSelect: (ticker: string, name: string, market: Market) => void
  /** 이미 추가된 항목 키 (`${market}:${ticker}` 형식) — disabled 처리 */
  excludeKeys?: Set<string>
  /** 노출 최대 개수 (default 12) */
  limit?: number
  /** 작은 버튼 모드 */
  compact?: boolean
  /** 라벨 (default "최근 사용 종목") */
  label?: string
}

export default function RecentTickersButtons({
  market = 'ALL',
  onSelect,
  excludeKeys,
  limit = 12,
  compact = false,
  label = '최근 사용 종목',
}: Props) {
  const { items, remove } = useRecentTickers()

  const filtered = items
    .filter((x) => market === 'ALL' || x.market === market)
    .slice(0, limit)

  if (filtered.length === 0) return null

  return (
    <div className="flex flex-nowrap sm:flex-wrap gap-1.5 items-center overflow-x-auto sm:overflow-visible -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 sm:pb-0 scrollbar-thin">
      <span className="text-xs text-at-text-weak inline-flex items-center gap-1 mr-1 flex-shrink-0">
        <History className="w-3 h-3" />
        {label}:
      </span>
      {filtered.map((it) => {
        const key = `${it.market}:${it.ticker}`
        const already = excludeKeys?.has(key) === true
        return (
          <span
            key={key}
            className={`inline-flex items-center rounded text-xs flex-shrink-0 ${
              compact
                ? 'px-1.5 py-0.5 bg-at-bg text-at-text-secondary'
                : 'px-2 py-1 bg-at-bg text-at-text-secondary'
            } ${already ? 'opacity-40' : ''}`}
          >
            <button
              type="button"
              onClick={() => { if (!already) onSelect(it.ticker, it.name, it.market) }}
              disabled={already}
              title={`${it.name} (${it.ticker})${already ? ' · 이미 추가됨' : ''}`}
              className={`inline-flex items-center gap-1 ${already ? 'cursor-not-allowed' : 'hover:text-at-accent'}`}
            >
              <Plus className="w-3 h-3" />
              <span className={`text-[9px] px-1 rounded font-bold ${it.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {it.market}
              </span>
              <span className="truncate max-w-[110px]">{it.name}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(it.ticker, it.market) }}
              title="목록에서 제거"
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
