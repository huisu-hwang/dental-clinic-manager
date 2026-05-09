'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Pin } from 'lucide-react'
import type { AuctionItem } from '@/types/auction'
import { calculatePrimary } from '@/lib/auction/roiCalculator'

interface Row {
  user_id: string
  item_id: string
  target_bid_price: number | null
  expected_monthly_rent: number | null
  expected_extra_cost: number | null
  memo: string | null
  created_at: string
  item: AuctionItem
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export default function FavoritesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    fetch('/api/auction/favorites').then(r => r.json()).then(j => setRows(j.items)).catch(() => setRows([]))
  }, [])

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-at-accent" /></div>

  const today = new Date().toISOString().slice(0, 10)
  const withDday = rows
    .filter(r => r.item) // skip rows where item failed to load
    .map(r => {
      const p = calculatePrimary(r.item, today)
      return { ...r, dDay: p.d_day }
    })
  const pinned = withDday.filter(r => r.dDay !== null && r.dDay <= 3)
  const others = withDday.filter(r => !pinned.includes(r))

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl font-bold mb-4">관심물건 ({rows.length}건)</h1>

      {pinned.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
            <Pin className="w-4 h-4" /> 매각기일 임박 (D-3 이내)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pinned.map(r => <FavCard key={r.item_id} row={r} />)}
          </div>
        </section>
      )}

      {others.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-at-text-secondary mb-2">전체 관심물건</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {others.map(r => <FavCard key={r.item_id} row={r} />)}
          </div>
        </section>
      ) : pinned.length === 0 ? (
        <p className="text-center text-at-text-secondary py-16">관심물건이 없습니다. 목록에서 ⭐로 추가하세요.</p>
      ) : null}
    </div>
  )
}

function FavCard({ row }: { row: Row & { dDay: number | null } }) {
  return (
    <Link href={`/investment/auction/${row.item_id}`} className="block bg-at-surface rounded-2xl p-4 border border-at-border hover:bg-at-surface-hover">
      <div className="text-sm text-at-text-secondary mb-1">
        {row.item.sido} {row.item.sigungu} {row.item.eupmyeondong}
      </div>
      <div className="text-xs text-at-text-secondary mb-3">{row.item.case_number}</div>
      <div className="grid grid-cols-2 gap-y-1 text-sm">
        <div>최저가</div><div className="text-right tabular-nums">{fmt(row.item.min_bid_price)}원</div>
        {row.target_bid_price ? <>
          <div>목표 응찰가</div><div className="text-right tabular-nums">{fmt(row.target_bid_price)}원</div>
        </> : null}
        {row.expected_monthly_rent ? <>
          <div>예상 월세</div><div className="text-right tabular-nums">{fmt(row.expected_monthly_rent)}원</div>
        </> : null}
        {row.dDay !== null ? <>
          <div>D-day</div><div className={`text-right ${row.dDay <= 3 ? 'text-rose-600 font-semibold' : ''}`}>D-{row.dDay}</div>
        </> : null}
      </div>
    </Link>
  )
}
