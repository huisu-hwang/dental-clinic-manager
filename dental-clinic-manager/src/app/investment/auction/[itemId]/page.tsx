'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AuctionDetailHeader } from '@/components/Investment/Auction/AuctionDetailHeader'
import { OverviewTab } from '@/components/Investment/Auction/tabs/OverviewTab'
import { SimulatorTab } from '@/components/Investment/Auction/tabs/SimulatorTab'
import { RightsTab } from '@/components/Investment/Auction/tabs/RightsTab'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'

interface DetailResponse {
  item: AuctionItem
  market: MarketPrice | null
  rights: any | null
  history: any[]
  ai: any | null
}

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'simulator', label: '시뮬레이터' },
  { id: 'rights', label: '권리분석' },
  { id: 'history', label: '이력·통계' },
  { id: 'attachments', label: '첨부' },
] as const

type TabId = typeof TABS[number]['id']

export default function AuctionDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    fetch(`/api/auction/items/${itemId}`).then(r => r.json()).then(setData).catch(() => setData(null))
  }, [itemId])

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-at-accent" /></div>

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-at-text-secondary mb-3">
        <ArrowLeft className="w-4 h-4" /> 뒤로
      </button>

      <AuctionDetailHeader item={data.item} market={data.market} />

      <div className="flex gap-1 border-b border-at-border mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
        {tab === 'history'     && <div className="text-at-text-secondary text-sm py-8 text-center">이력·통계 탭 (Task 8에서 구현)</div>}
        {tab === 'attachments' && <div className="text-at-text-secondary text-sm py-8 text-center">첨부 탭 (Task 8에서 구현)</div>}
      </div>
    </div>
  )
}
