'use client'

/**
 * 스크리너 히스토리 탭 — 사용자가 실행한 screener_runs를 날짜별로 그룹핑해 노출.
 * 항목 클릭 시 ScreenerResultsView로 결과를 펼쳐 보여줌.
 */

import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronDown, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import ScreenerResultsView, { type ScreenerResultsData } from './ScreenerResultsView'
import type { Market } from '@/types/investment'

interface RunSummary {
  id: string
  started_at: string
  finished_at: string | null
  status: 'completed' | 'cancelled' | 'error'
  as_of_date: string
  universe: string
  universe_label: string | null
  realtime: boolean
  total_tickers: number
  total_matches: number
  strategy_keys: string[]
  strategy_names: Record<string, string>
}

interface RunFull extends RunSummary {
  matches_by_strategy: Record<string, ScreenerResultsData['matchesByStrategy'][string]>
  failed_by_strategy: Record<string, ScreenerResultsData['failedByStrategy'][string]>
  error_message: string | null
}

interface Props {
  onSelectTicker?: (ticker: string, market: Market, name: string) => void
}

export default function ScreenerHistoryTab({ onSelectTicker }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunFull | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/investment/screener-runs', { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json()
      setRuns(json.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '히스토리 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // 날짜별 그룹핑
  const groups = useMemo(() => {
    const map: Record<string, RunSummary[]> = {}
    for (const r of runs) {
      const d = new Date(r.started_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [runs])

  // selectedId 변경 시 단건 fetch
  useEffect(() => {
    if (!selectedId) {
      setSelectedRun(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    fetch(`/api/investment/screener-runs?id=${encodeURIComponent(selectedId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j?.error ?? `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j) => { if (!cancelled) setSelectedRun(j.item ?? null) })
      .catch((e) => {
        if (!cancelled) {
          console.error(e)
          setSelectedRun(null)
        }
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [selectedId])

  const handleDelete = async (id: string) => {
    if (!confirm('이 스크리닝 결과를 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/investment/screener-runs?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      if (selectedId === id) {
        setSelectedId(null)
      }
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const resultsData: ScreenerResultsData | null = selectedRun ? {
    asOfDate: selectedRun.as_of_date,
    universeLabel: selectedRun.universe_label || selectedRun.universe,
    realtime: selectedRun.realtime,
    total: selectedRun.total_tickers,
    processed: selectedRun.total_tickers,
    strategyKeys: selectedRun.strategy_keys,
    strategyNames: selectedRun.strategy_names,
    matchesByStrategy: selectedRun.matches_by_strategy,
    failedByStrategy: selectedRun.failed_by_strategy,
  } : null

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center gap-2 text-at-text-secondary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          히스토리 불러오는 중...
        </div>
      )}
      {error && !loading && (
        <div className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="text-xs text-at-text-weak text-center py-8 bg-white rounded-2xl border border-at-border">
          저장된 스크리닝 결과가 없습니다. 새 스캔을 실행하면 자동으로 저장됩니다.
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="bg-white rounded-2xl border border-at-border divide-y divide-at-border">
          {groups.map(([dateKey, items]) => {
            const isOpen = expandedDate === dateKey
            const totalMatchSum = items.reduce((s, r) => s + r.total_matches, 0)
            return (
              <div key={dateKey}>
                <button
                  onClick={() => setExpandedDate(isOpen ? null : dateKey)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-at-surface-alt"
                >
                  <div className="flex items-center gap-2 text-sm">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Calendar className="w-3.5 h-3.5 text-at-text-weak" />
                    <span className="font-semibold text-at-text">{dateKey}</span>
                    <span className="text-xs text-at-text-secondary">{items.length}회 실행</span>
                  </div>
                  <span className="text-xs text-at-text-secondary">
                    누적 매칭 <span className="font-mono font-semibold text-purple-600">{totalMatchSum}</span>건
                  </span>
                </button>

                {isOpen && (
                  <div className="bg-at-surface-alt/30 px-4 py-2 space-y-1">
                    {items.map((r) => {
                      const time = new Date(r.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                      const isSelected = selectedId === r.id
                      const strategyDisplay = r.strategy_keys
                        .map((k) => r.strategy_names[k] || k)
                        .slice(0, 3)
                        .join(', ') + (r.strategy_keys.length > 3 ? ` 외 ${r.strategy_keys.length - 3}` : '')
                      return (
                        <div
                          key={r.id}
                          className={`flex items-center justify-between gap-2 rounded px-3 py-2 text-xs cursor-pointer ${isSelected ? 'bg-blue-100/50 border border-blue-300' : 'hover:bg-white border border-transparent'}`}
                          onClick={() => setSelectedId(r.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-at-text-secondary">{time}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              r.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                              : r.status === 'cancelled' ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                            }`}>
                              {r.status === 'completed' ? '완료' : r.status === 'cancelled' ? '취소' : '에러'}
                            </span>
                            <span className="truncate text-at-text">{strategyDisplay}</span>
                            <span className="text-at-text-weak">·</span>
                            <span className="text-at-text-weak">{r.universe_label || r.universe}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-semibold text-purple-600">{r.total_matches}건</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                              className="text-at-text-weak hover:text-rose-500 p-0.5"
                              title="삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedId && (
        <div className="space-y-2">
          {loadingDetail && (
            <div className="flex items-center gap-2 text-at-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              결과 불러오는 중...
            </div>
          )}
          {!loadingDetail && resultsData && (
            <ScreenerResultsView
              data={resultsData}
              onSelectTicker={onSelectTicker}
              headerLabel="📁 저장된 스크리닝 결과"
            />
          )}
        </div>
      )}
    </div>
  )
}
