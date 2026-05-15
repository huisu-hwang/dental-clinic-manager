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
    <div className="bg-at-surface rounded-2xl border border-at-border shadow-at-card p-5 md:p-6 mb-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[13px] md:text-sm font-medium text-at-text-secondary mb-1">
            {item.case_number} · {item.court_name}
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-at-text leading-tight">
            {item.sido} {item.sigungu} {item.eupmyeondong}
          </h1>
        </div>
        {p.d_day !== null && (
          <span className="shrink-0 px-3 py-1.5 rounded-full bg-[var(--at-warning-bg)] text-[var(--at-warning)] text-sm font-bold">
            D-{p.d_day}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-4 border-t border-at-border">
        <Field label="감정가" value={`${fmt(item.appraisal_price)}원`} />
        <Field label="최저입찰가" value={`${fmt(item.min_bid_price)}원`} highlight />
        <Field label="할인율" value={`−${p.discount_rate_pct.toFixed(1)}%`} accent="success" />
        {s && (
          <Field label="시세 대비" value={`−${s.market_discount_rate_pct.toFixed(1)}%`} accent="accent" />
        )}
        <Field label="유찰" value={`${p.failure_count}회 (${p.round_no}차)`} />
        <Field label="매각기일" value={item.next_auction_date ?? '미정'} />
        <Field label="입찰보증금" value={`${fmt(p.bid_deposit)}원`} />
      </div>
    </div>
  )
}

function Field({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: 'success'|'accent' }) {
  const colorCls = accent === 'success' ? 'text-[var(--at-success)]'
                : accent === 'accent'  ? 'text-at-accent'
                : 'text-at-text'
  return (
    <div>
      <div className="text-[12px] md:text-xs text-at-text-weak font-medium mb-0.5">{label}</div>
      <div className={`text-[15px] md:text-base ${highlight ? 'font-extrabold' : 'font-bold'} ${colorCls} tabular-nums`}>
        {value}
      </div>
    </div>
  )
}
