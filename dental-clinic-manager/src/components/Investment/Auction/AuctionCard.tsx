'use client'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { AuctionItem, MarketPrice } from '@/types/auction'
import { calculatePrimary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem & { market: MarketPrice | null }
  isFavorite: boolean
  onToggleFavorite: (itemId: string) => void
  // 있으면 카드 클릭 시 콜백 호출(dashboard 내부 라우팅). 없으면 기존 페이지 라우트로 이동.
  onClick?: () => void
}

const PROPERTY_LABEL: Record<string, string> = {
  apt: '아파트', officetel: '오피스텔', villa: '빌라', house: '단독주택',
  commercial: '상가', land: '토지', factory: '공장', forest: '임야', other: '기타'
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function AuctionCard({ item, isFavorite, onToggleFavorite, onClick }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const primary = calculatePrimary(item, today)
  const m = item.market

  const innerClassName = 'block bg-at-surface border border-at-border rounded-2xl p-4 hover:bg-at-surface-hover transition-colors cursor-pointer'

  const innerContent = (
    <>
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm text-at-text-secondary">
          {PROPERTY_LABEL[item.property_type] ?? '기타'} · {item.sido} {item.sigungu} {item.eupmyeondong}
          {item.building_area_m2 ? ` · ${item.building_area_m2}㎡` : ''}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(item.id) }}
          aria-label="관심물건 토글"
          className="p-1.5 rounded-lg hover:bg-at-accent-light"
        >
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-at-text-secondary'}`} />
        </button>
      </div>

      <div className="text-xs text-at-text-secondary mb-3">
        {item.case_number} · {item.court_name}
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-sm">
        <div>감정가</div>
        <div className="text-right">{fmt(item.appraisal_price)}원</div>
        <div>최저가</div>
        <div className="text-right font-medium">{fmt(item.min_bid_price)}원</div>
        <div>할인율</div>
        <div className="text-right text-emerald-600">-{primary.discount_rate_pct.toFixed(1)}%</div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
        {m?.match_confidence === 'high' && m.median_price_3m && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            시세 대비 -{Math.round((m.median_price_3m - item.min_bid_price) / m.median_price_3m * 100)}%
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-at-surface-alt">유찰 {primary.failure_count}회</span>
        {primary.d_day !== null && (
          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">D-{primary.d_day}</span>
        )}
        {primary.price_per_m2 && (
          <span className="px-2 py-0.5 rounded-full bg-at-surface-alt">㎡당 {fmt(primary.price_per_m2)}원</span>
        )}
      </div>
    </>
  )

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        className={innerClassName}
      >
        {innerContent}
      </div>
    )
  }

  return (
    <Link
      href={`/investment/auction/${item.id}`}
      className={innerClassName}
    >
      {innerContent}
    </Link>
  )
}
