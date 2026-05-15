'use client'
import { useState, useMemo } from 'react'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'
import { calculateSecondary, calculateTertiary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
  initialInput?: Partial<SimulatorInput>
  onSave?: (input: SimulatorInput) => void
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function SimulatorTab({ item, market, initialInput, onSave }: Props) {
  const [input, setInput] = useState<SimulatorInput>({
    bid_price: initialInput?.bid_price ?? item.min_bid_price,
    monthly_rent: initialInput?.monthly_rent ?? estimateInitialRent(item, market),
    monthly_management_cost: initialInput?.monthly_management_cost ?? 200_000,
    annual_property_tax: initialInput?.annual_property_tax ?? 0,
    repair_cost: initialInput?.repair_cost ?? 0,
    unpaid_dues: initialInput?.unpaid_dues ?? 0,
    is_multi_owner: initialInput?.is_multi_owner ?? false,
  })

  const tertiary = useMemo(() => calculateTertiary(item, input), [item, input])
  const secondary = useMemo(() => {
    if (!market) return null
    return calculateSecondary(item, market, {
      isMultiOwner: input.is_multi_owner,
      repairCost: input.repair_cost,
      unpaidDues: input.unpaid_dues,
    })
  }, [item, market, input])

  const set = <K extends keyof SimulatorInput>(k: K, v: SimulatorInput[K]) => setInput(p => ({ ...p, [k]: v }))

  const min = item.min_bid_price
  const max = Math.round(item.appraisal_price * 1.1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border space-y-5">
        <h3 className="text-base font-semibold text-at-text">입찰 시뮬레이션 입력</h3>

        <Slider label="응찰가" value={input.bid_price} min={min} max={max} step={100_000} format={(n) => `${fmt(n)}원`} onChange={(v) => set('bid_price', v)} />
        <Slider label="예상 월세" value={input.monthly_rent} min={0} max={20_000_000} step={50_000} format={(n) => `${fmt(n)}원/월`} onChange={(v) => set('monthly_rent', v)} />
        <Slider label="월 관리비" value={input.monthly_management_cost} min={0} max={2_000_000} step={10_000} format={(n) => `${fmt(n)}원/월`} onChange={(v) => set('monthly_management_cost', v)} />
        <Slider label="연 재산세" value={input.annual_property_tax} min={0} max={50_000_000} step={100_000} format={(n) => `${fmt(n)}원/년`} onChange={(v) => set('annual_property_tax', v)} />
        <Slider label="수리비" value={input.repair_cost} min={0} max={200_000_000} step={1_000_000} format={(n) => `${fmt(n)}원`} onChange={(v) => set('repair_cost', v)} />
        <Slider label="체납 관리비/세금" value={input.unpaid_dues} min={0} max={50_000_000} step={100_000} format={(n) => `${fmt(n)}원`} onChange={(v) => set('unpaid_dues', v)} />

        <label className="flex items-center gap-2 text-[14px] md:text-sm text-at-text">
          <input type="checkbox" checked={input.is_multi_owner} onChange={(e) => set('is_multi_owner', e.target.checked)} />
          다주택자 (취득세 12% 적용)
        </label>

        {onSave && (
          <button onClick={() => onSave(input)} className="w-full py-2.5 rounded-xl bg-at-accent text-white font-semibold">
            관심물건에 저장
          </button>
        )}
      </div>

      <div className="space-y-4">
        {secondary && (
          <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border">
            <h3 className="text-base font-semibold mb-3 text-at-text">매도 시뮬 (시세 기반)</h3>
            <Result label="예상 시세" value={`${fmt(secondary.expected_market_price)}원`} />
            <Result label="예상 매도차익" value={`${fmt(secondary.expected_resale_profit)}원`} accent={secondary.expected_resale_profit > 0 ? 'emerald' : 'rose'} />
            <Result label="단순 수익률" value={`${secondary.simple_roi_pct.toFixed(2)}%`} accent={secondary.simple_roi_pct > 0 ? 'emerald' : 'rose'} />
            <p className="text-[13px] md:text-xs text-at-text-secondary mt-2">시세 매칭 신뢰도: {secondary.match_confidence}</p>
          </div>
        )}

        <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border">
          <h3 className="text-base font-semibold mb-3 text-at-text">임대 시뮬</h3>
          <Result label="총 투자비용" value={`${fmt(tertiary.total_investment)}원`} />
          <Result label="연 순임대수익" value={`${fmt(tertiary.annual_net_rent)}원`} />
          <Result label="임대수익률" value={`${tertiary.rental_yield_pct.toFixed(2)}%`} accent={tertiary.rental_yield_pct > 0 ? 'emerald' : 'rose'} />
          <Result label="원금 회수기간" value={tertiary.payback_years === null ? '계산 불가' : `${tertiary.payback_years.toFixed(1)}년`} />
        </div>
      </div>
    </div>
  )
}

function estimateInitialRent(item: AuctionItem, market: MarketPrice | null): number {
  const base = market?.median_price_3m ?? item.appraisal_price
  return Math.round(base * 0.004 / 50_000) * 50_000
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5 gap-2">
        <label className="text-[14px] md:text-sm font-semibold text-at-text">{label}</label>
        <span className="text-[14px] md:text-sm tabular-nums font-semibold text-at-text">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  )
}

function Result({ label, value, accent }: { label: string; value: string; accent?: 'emerald'|'rose' }) {
  const cls = accent === 'emerald' ? 'text-emerald-600 font-bold'
            : accent === 'rose' ? 'text-rose-600 font-bold'
            : 'text-at-text font-semibold'
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-at-border last:border-b-0 gap-2">
      <span className="text-[14px] md:text-sm text-at-text-secondary">{label}</span>
      <span className={`text-base tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}
