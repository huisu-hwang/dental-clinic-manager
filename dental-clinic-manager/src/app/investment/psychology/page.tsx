'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import Watchlist from '@/components/Investment/Psychology/Watchlist'
import AnalysisDetail from '@/components/Investment/Psychology/AnalysisDetail'
import AnalysisHistory from '@/components/Investment/Psychology/AnalysisHistory'
import AddTickerModal from '@/components/Investment/Psychology/AddTickerModal'
import type { PsychologyWatchlistItem, PsychologyAnalysisRecord } from '@/types/psychology'
import type { Market } from '@/types/investment'

interface ItemWithLatest extends PsychologyWatchlistItem {
  latest_analysis?: { psychology_score: number; score_label: string; created_at: string } | null
}

function PsychologyPageInner() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<ItemWithLatest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ ticker: string; market: Market } | null>(null)
  const [history, setHistory] = useState<PsychologyAnalysisRecord[]>([])
  const [latest, setLatest] = useState<PsychologyAnalysisRecord | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const reloadList = useCallback(async () => {
    const r = await fetch('/api/investment/psychology/watchlist')
    if (r.ok) setItems(await r.json())
  }, [])

  const reloadHistory = useCallback(async (ticker: string, market: Market) => {
    const r = await fetch(`/api/investment/psychology/analyses?ticker=${ticker}&market=${market}&limit=10`)
    if (!r.ok) return
    const arr = (await r.json()) as PsychologyAnalysisRecord[]
    setHistory(arr)
    setLatest(arr[0] ?? null)
  }, [])

  useEffect(() => {
    reloadList().then(() => setLoading(false))
  }, [reloadList])

  useEffect(() => {
    const t = searchParams.get('ticker')
    const m = searchParams.get('market') as Market | null
    if (!t || !m) return
    setSelected({ ticker: t.toUpperCase(), market: m })
    reloadHistory(t.toUpperCase(), m)
  }, [searchParams, reloadHistory])

  const onSelect = (it: ItemWithLatest) => {
    setSelected({ ticker: it.ticker, market: it.market })
    reloadHistory(it.ticker, it.market)
  }

  const onToggleMonitoring = async (it: ItemWithLatest) => {
    await fetch(`/api/investment/psychology/watchlist/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoring_enabled: !it.monitoring_enabled }),
    })
    reloadList()
  }

  const onDelete = async (id: string) => {
    if (!confirm('삭제하시겠어요?')) return
    await fetch(`/api/investment/psychology/watchlist?id=${id}`, { method: 'DELETE' })
    reloadList()
    if (selected) {
      const stillExists = items.some(i => i.id !== id && i.ticker === selected.ticker && i.market === selected.market)
      if (!stillExists) { setSelected(null); setLatest(null); setHistory([]) }
    }
  }

  if (loading) {
    return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold">워치리스트</h2>
          <button onClick={() => setAddOpen(true)}
            className="p-1 rounded hover:bg-gray-100" title="종목 추가">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <Watchlist
          items={items}
          selected={selected}
          onSelect={onSelect}
          onToggleMonitoring={onToggleMonitoring}
          onDelete={onDelete}
        />
        <div className="text-[10px] text-gray-400 mt-2">{items.length}/10</div>
      </aside>

      <section className="space-y-4">
        {!selected && (
          <div className="rounded-xl border bg-gray-50 p-12 text-center text-gray-500 text-sm">
            왼쪽에서 종목을 선택하세요.
          </div>
        )}
        {selected && (
          <>
            <AnalysisDetail
              ticker={selected.ticker}
              market={selected.market}
              latest={latest}
              onAnalyzed={(rec) => {
                setLatest(rec)
                setHistory(prev => [rec, ...prev].slice(0, 10))
              }}
            />
            <AnalysisHistory records={history} onSelect={(r) => setLatest(r)} />
          </>
        )}
      </section>

      {addOpen && <AddTickerModal onClose={() => setAddOpen(false)} onAdded={reloadList} />}
    </div>
  )
}

export default function PsychologyPage() {
  return (
    <Suspense fallback={<div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <PsychologyPageInner />
    </Suspense>
  )
}
