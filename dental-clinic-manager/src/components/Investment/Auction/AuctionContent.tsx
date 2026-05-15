'use client'

// 부동산 경매 통합 콘텐츠.
// dashboard 의 InvestmentTab 안에서 사용된다 — list 와 detail 을 한 컴포넌트에서 처리해
// 좌측 사이드바를 유지한 채 우측 컨텐츠 영역에서만 화면이 전환되도록 한다.
//
// 상태:
//   - selectedItemId === null → 목록 화면
//   - selectedItemId === <uuid> → 상세 화면
// URL ?item=<uuid> 파라미터로 동기화하여 새로고침 / 직접 링크에서도 같은 화면 복원.

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AuctionFilters } from './AuctionFilters'
import { AuctionCard } from './AuctionCard'
import { AuctionDetailHeader } from './AuctionDetailHeader'
import { OverviewTab } from './tabs/OverviewTab'
import { SimulatorTab } from './tabs/SimulatorTab'
import { RightsTab } from './tabs/RightsTab'
import { HistoryTab } from './tabs/HistoryTab'
import { AttachmentsTab } from './tabs/AttachmentsTab'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'

type Row = AuctionItem & { market: MarketPrice | null }

interface DetailResponse {
  item: AuctionItem
  market: MarketPrice | null
  rights: any | null
  history: any[]
  ai: any | null
}

const DETAIL_TABS = [
  { id: 'overview', label: '개요' },
  { id: 'simulator', label: '시뮬레이터' },
  { id: 'rights', label: '권리분석' },
  { id: 'history', label: '이력·통계' },
  { id: 'attachments', label: '첨부' },
] as const

type DetailTabId = typeof DETAIL_TABS[number]['id']

export default function AuctionContent() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const itemFromUrl = sp.get('item')

  const [selectedItemId, setSelectedItemId] = useState<string | null>(itemFromUrl)

  // URL 의 ?item= 가 외부에서 바뀌면(예: 뒤로 가기) 상태 동기화
  useEffect(() => {
    setSelectedItemId(itemFromUrl)
  }, [itemFromUrl])

  const openDetail = useCallback((id: string) => {
    setSelectedItemId(id)
    const params = new URLSearchParams(Array.from(sp.entries()))
    params.set('item', id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    // 상세 진입 시 스크롤 상단으로
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, router, sp])

  const closeDetail = useCallback(() => {
    setSelectedItemId(null)
    const params = new URLSearchParams(Array.from(sp.entries()))
    params.delete('item')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, sp])

  if (selectedItemId) {
    return <AuctionDetailView itemId={selectedItemId} onBack={closeDetail} />
  }
  return <AuctionListView onOpen={openDetail} />
}

// ─── 목록 화면 ─────────────────────────────────────────────────────────
function AuctionListView({ onOpen }: { onOpen: (id: string) => void }) {
  const sp = useSearchParams()
  const [items, setItems] = useState<Row[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<number | null>(0)

  // ?item= 외의 필터 파라미터만 전달 — item 은 상세 진입 표시일 뿐
  const filterParams = (() => {
    const p = new URLSearchParams(Array.from(sp.entries()))
    p.delete('item')
    p.delete('tab')
    p.delete('sub')
    return p
  })()

  const load = useCallback(async (c: number | null) => {
    if (c === null) return
    setLoading(true)
    const params = new URLSearchParams(filterParams)
    params.set('cursor', String(c))
    const r = await fetch(`/api/auction/items?${params}`)
    const j = await r.json()
    setItems(prev => c === 0 ? j.items : [...prev, ...j.items])
    setTotal(j.total)
    setCursor(j.nextCursor)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams.toString()])

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
      if (isFav) next.delete(itemId); else next.add(itemId)
      return next
    })
    await fetch('/api/auction/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">부동산 경매 ({new Intl.NumberFormat('ko-KR').format(total)}건)</h1>
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
              onClick={() => onOpen(item.id)}
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

// ─── 상세 화면 ─────────────────────────────────────────────────────────
function AuctionDetailView({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [tab, setTab] = useState<DetailTabId>('overview')

  useEffect(() => {
    setData(null)
    fetch(`/api/auction/items/${itemId}`).then(r => r.json()).then(setData).catch(() => setData(null))
  }, [itemId])

  if (!data) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-at-accent" /></div>
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-0">
      <button onClick={onBack} className="flex items-center gap-1 text-[14px] md:text-sm font-medium text-at-text-secondary hover:text-at-text mb-3">
        <ArrowLeft className="w-4 h-4" /> 목록으로
      </button>

      <AuctionDetailHeader item={data.item} market={data.market} />

      <div className="flex gap-1 border-b border-at-border mb-4 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        {DETAIL_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[15px] md:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === t.id ? 'border-at-accent text-at-accent' : 'border-transparent text-at-text-secondary hover:text-at-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview'    && <OverviewTab item={data.item} market={data.market} />}
        {tab === 'simulator' && (
          <SimulatorTab
            item={data.item}
            market={data.market}
            onSave={async (input: SimulatorInput) => {
              await fetch('/api/auction/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  itemId: data.item.id,
                  target_bid_price: input.bid_price,
                  expected_extra_cost: input.repair_cost + input.unpaid_dues,
                  expected_monthly_rent: input.monthly_rent,
                }),
              })
              alert('관심물건에 저장되었습니다.')
            }}
          />
        )}
        {tab === 'rights'      && <RightsTab itemId={data.item.id} rights={data.rights} initialAi={data.ai} />}
        {tab === 'history'     && <HistoryTab itemId={data.item.id} history={data.history} />}
        {tab === 'attachments' && <AttachmentsTab item={data.item} />}
      </div>
    </div>
  )
}
