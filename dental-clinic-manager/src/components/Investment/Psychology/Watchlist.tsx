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
    return <div className="text-sm text-gray-500 p-4 text-center">+ 버튼으로 종목을 추가해주세요.</div>
  }
  return (
    <ul className="space-y-1">
      {items.map(it => {
        const isActive = selected?.ticker === it.ticker && selected.market === it.market
        return (
          <li key={it.id}
            className={`group rounded-lg p-2 cursor-pointer ${isActive ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}
            onClick={() => onSelect(it)}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-semibold text-sm">{it.ticker}</span>
                <span className="text-[10px] text-gray-500">{it.market}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.stopPropagation(); onToggleMonitoring(it) }}
                  className={`p-1 rounded ${it.monitoring_enabled ? 'text-blue-600' : 'text-gray-400'}`}
                  title={it.monitoring_enabled ? '모니터링 중' : 'OFF'}>
                  {it.monitoring_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(it.id) }}
                  className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {it.latest_analysis && (
              <div className="mt-1 flex justify-between text-[10px] text-gray-500">
                <span>{it.latest_analysis.score_label}</span>
                <span className="font-mono font-semibold">{it.latest_analysis.psychology_score}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
