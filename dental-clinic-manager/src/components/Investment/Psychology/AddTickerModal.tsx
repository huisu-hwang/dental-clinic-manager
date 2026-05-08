'use client'
import { useState } from 'react'
import { Loader2, X, AlertCircle } from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import RecentTickersButtons from '@/components/Investment/RecentTickersButtons'
import FavoritesButtons from '@/components/Investment/FavoritesButtons'
import { useRecentTickers } from '@/hooks/useRecentTickers'
import type { Market } from '@/types/investment'

interface Selected {
  ticker: string
  name: string
  market: Market
}

export default function AddTickerModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: () => void
}) {
  const [selected, setSelected] = useState<Selected | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { add: rememberTicker } = useRecentTickers()

  const handlePick = (ticker: string, name?: string, market?: Market) => {
    if (!market) return
    setSelected({ ticker, name: name || ticker, market })
    setError(null)
  }

  const onSubmit = async () => {
    if (!selected) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/investment/psychology/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selected.ticker, market: selected.market }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '추가 실패'); return }
      rememberTicker(selected.ticker, selected.name, selected.market)
      onAdded()
      onClose()
    } finally { setSubmitting(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-lg w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border">
          <h3 className="text-lg font-bold text-at-text">종목 추가</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-at-text-weak hover:bg-at-surface-alt transition-colors"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-at-text-secondary mb-2">종목 검색</label>
            <TickerSearch
              onSelect={handlePick}
              market="ALL"
              placeholder="종목명 또는 티커 (예: 삼성전자, AAPL)"
              clearOnSelect={false}
            />
          </div>

          <div className="space-y-2">
            <FavoritesButtons market="ALL" onSelect={handlePick} />
            <RecentTickersButtons market="ALL" onSelect={handlePick} />
          </div>

          {selected && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-at-accent-light text-at-accent text-sm">
              <span className="font-semibold">{selected.ticker}</span>
              <span className="text-at-text-secondary">·</span>
              <span className="truncate">{selected.name}</span>
              <span className="ml-auto text-[11px] text-at-text-secondary">
                {selected.market === 'KR' ? '한국' : '미국'}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-at-border bg-at-surface-alt">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-at-text-secondary hover:bg-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !selected}
            className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
