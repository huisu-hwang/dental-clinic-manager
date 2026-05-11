'use client'
import { Trash2, Eye, EyeOff } from 'lucide-react'
import type { PsychologyWatchlistItem } from '@/types/psychology'

interface ItemWithLatest extends PsychologyWatchlistItem {
  latest_analysis?: { psychology_score: number; score_label: string; created_at: string } | null
}

export default function Watchlist({
  items, selected, onSelect, onToggleMonitoring, onDelete,
}: {
  items: ItemWithLatest[]
  selected: { ticker: string; market: string } | null
  onSelect: (it: ItemWithLatest) => void
  onToggleMonitoring: (it: ItemWithLatest) => void
  onDelete: (id: string) => void
}) {
  if (!items.length) {
    return (
      <div className="text-sm text-at-text-weak p-4 text-center">
        + 버튼으로 종목을 추가해주세요.
      </div>
    )
  }
  return (
    <ul className="space-y-1">
      {items.map(it => {
        const isActive = selected?.ticker === it.ticker && selected.market === it.market
        return (
          <li key={it.id}
            className={`group rounded-xl p-2.5 cursor-pointer transition-colors ${
              isActive
                ? 'bg-at-accent-light ring-1 ring-at-accent'
                : 'hover:bg-at-surface-alt'
            }`}
            onClick={() => onSelect(it)}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-sm truncate ${isActive ? 'text-at-accent' : 'text-at-text'}`}>
                  {it.name || it.ticker}
                </div>
                {it.name && it.name !== it.ticker && (
                  <div className="text-[11px] font-mono text-at-text-weak truncate">
                    {it.ticker} · {it.market === 'KR' ? '한국' : '미국'}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); onToggleMonitoring(it) }}
                  className={`p-1 rounded-lg transition-colors ${
                    it.monitoring_enabled
                      ? 'text-at-accent hover:bg-at-accent-light'
                      : 'text-at-text-weak hover:bg-at-surface-alt'
                  }`}
                  title={it.monitoring_enabled ? '모니터링 중' : '모니터링 OFF'}>
                  {it.monitoring_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(it.id) }}
                  className="p-1 rounded-lg text-at-text-weak hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="삭제">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {it.latest_analysis && (
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-at-text-secondary truncate">{it.latest_analysis.score_label}</span>
                <span className="font-mono font-semibold text-at-text">{it.latest_analysis.psychology_score}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
