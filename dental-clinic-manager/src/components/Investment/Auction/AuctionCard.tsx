'use client'
import Link from 'next/link'
import { Star, Building2, Building, Home, Store, Mountain, Factory, Trees, MapPin } from 'lucide-react'
import type { AuctionItem, MarketPrice, PropertyType } from '@/types/auction'
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

// 용도별 placeholder 아이콘 + 그라데이션 — 실제 사진이 없을 때 시각적 차별화 제공
const PROPERTY_VISUAL: Record<PropertyType, { icon: React.ElementType; gradient: string; iconColor: string }> = {
  apt:        { icon: Building2, gradient: 'from-sky-100 to-sky-50',         iconColor: 'text-sky-600' },
  officetel:  { icon: Building,  gradient: 'from-indigo-100 to-indigo-50',   iconColor: 'text-indigo-600' },
  villa:      { icon: Home,      gradient: 'from-emerald-100 to-emerald-50', iconColor: 'text-emerald-600' },
  house:      { icon: Home,      gradient: 'from-amber-100 to-amber-50',     iconColor: 'text-amber-700' },
  commercial: { icon: Store,     gradient: 'from-rose-100 to-rose-50',       iconColor: 'text-rose-600' },
  land:       { icon: Mountain,  gradient: 'from-lime-100 to-lime-50',       iconColor: 'text-lime-700' },
  factory:    { icon: Factory,   gradient: 'from-slate-200 to-slate-100',    iconColor: 'text-slate-600' },
  forest:     { icon: Trees,     gradient: 'from-green-100 to-green-50',     iconColor: 'text-green-700' },
  other:      { icon: MapPin,    gradient: 'from-stone-200 to-stone-100',    iconColor: 'text-stone-600' },
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function AuctionCard({ item, isFavorite, onToggleFavorite, onClick }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const primary = calculatePrimary(item, today)
  const m = item.market

  const innerClassName = 'block bg-at-surface border border-at-border rounded-2xl overflow-hidden hover:bg-at-surface-hover transition-colors cursor-pointer'
  const photoUrl = item.photos && item.photos.length > 0 ? item.photos[0] : null
  const visual = PROPERTY_VISUAL[item.property_type] ?? PROPERTY_VISUAL.other
  const PlaceholderIcon = visual.icon

  const innerContent = (
    <>
      {/* 대표 이미지 영역 — 실제 사진이 있으면 표시, 없으면 용도별 placeholder */}
      <div className="relative w-full aspect-[16/9] bg-at-surface-alt">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`${PROPERTY_LABEL[item.property_type] ?? '경매물건'} ${item.sigungu ?? ''}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${visual.gradient} flex flex-col items-center justify-center`}>
            <PlaceholderIcon className={`w-12 h-12 ${visual.iconColor} mb-2`} strokeWidth={1.5} />
            <span className={`text-xs font-medium ${visual.iconColor}`}>
              {PROPERTY_LABEL[item.property_type] ?? '기타'}
            </span>
          </div>
        )}
        {/* 우상단 좋아요 — 이미지 위에 띄움 */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(item.id) }}
          aria-label="관심물건 토글"
          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 backdrop-blur-sm shadow hover:bg-white"
        >
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-at-text-secondary'}`} />
        </button>
        {/* 좌상단 용도 배지 (사진이 있을 때만 — placeholder 에는 이미 라벨 있음) */}
        {photoUrl && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[11px] font-semibold text-at-text">
            {PROPERTY_LABEL[item.property_type] ?? '기타'}
          </span>
        )}
        {/* 좌하단 D-day */}
        {primary.d_day !== null && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow">
            D-{primary.d_day}
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="text-[15px] md:text-sm font-semibold text-slate-900 mb-1">
          {item.sido} {item.sigungu} {item.eupmyeondong}
          {item.building_area_m2 ? ` · ${item.building_area_m2}㎡` : ''}
        </div>

        <div className="text-[13px] md:text-xs text-slate-500 mb-3 font-medium">
          {item.case_number} · {item.court_name}
        </div>

        <dl className="grid grid-cols-2 gap-y-1.5 text-[14px] md:text-sm">
          <dt className="text-slate-600 font-medium">감정가</dt>
          <dd className="text-right text-slate-900 font-semibold tabular-nums">{fmt(item.appraisal_price)}원</dd>
          <dt className="text-slate-600 font-medium">최저가</dt>
          <dd className="text-right text-slate-900 font-bold tabular-nums">{fmt(item.min_bid_price)}원</dd>
          <dt className="text-slate-600 font-medium">할인율</dt>
          <dd className="text-right text-emerald-600 font-bold tabular-nums">-{primary.discount_rate_pct.toFixed(1)}%</dd>
        </dl>

        <div className="flex items-center gap-2 mt-3 flex-wrap text-[12px] md:text-xs font-semibold">
          {m?.match_confidence === 'high' && m.median_price_3m && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              시세 대비 -{Math.round((m.median_price_3m - item.min_bid_price) / m.median_price_3m * 100)}%
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">유찰 {primary.failure_count}회</span>
          {primary.price_per_m2 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">㎡당 {fmt(primary.price_per_m2)}원</span>
          )}
        </div>
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
