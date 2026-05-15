'use client'
import type { AuctionItem, MarketPrice } from '@/types/auction'
import { calculatePrimary, calculateSecondary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function AuctionDetailHeader({ item, market }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const p = calculatePrimary(item, today)
  const s = market ? calculateSecondary(item, market, { isMultiOwner: false }) : null

  return (
    <div className="bg-at-surface rounded-2xl p-5 md:p-6 border border-at-border mb-4">
      <div className="text-[13px] md:text-sm text-at-text-secondary mb-1">
        {item.case_number} · {item.court_name}
      </div>
      <h1 className="text-lg md:text-xl font-bold mb-4 text-at-text">
        {item.sido} {item.sigungu} {item.eupmyeondong}
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="감정가" value={`${fmt(item.appraisal_price)}원`} />
        <Field label="최저입찰가" value={`${fmt(item.min_bid_price)}원`} highlight />
        <Field label="할인율" value={`-${p.discount_rate_pct.toFixed(1)}%`} accent="emerald" />
        {s && (
          <Field label="시세 대비" value={`-${s.market_discount_rate_pct.toFixed(1)}%`} accent="blue" />
        )}
        <Field label="유찰" value={`${p.failure_count}회 (${p.round_no}차)`} />
        <Field label="매각기일" value={item.next_auction_date ?? '미정'} />
        {p.d_day !== null && <Field label="D-day" value={`D-${p.d_day}`} accent="amber" />}
        <Field label="입찰보증금" value={`${fmt(p.bid_deposit)}원`} />
      </div>
    </div>
  )
}

function Field({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: 'emerald'|'blue'|'amber' }) {
  const colorCls = accent === 'emerald' ? 'text-emerald-600'
                : accent === 'blue'    ? 'text-blue-600'
                : accent === 'amber'   ? 'text-amber-600'
                : 'text-at-text'
  return (
    <div>
      <div className="text-[13px] md:text-xs text-at-text-secondary">{label}</div>
      <div className={`text-base md:text-base ${highlight ? 'font-bold' : 'font-semibold'} ${colorCls} tabular-nums`}>{value}</div>
    </div>
  )
}
