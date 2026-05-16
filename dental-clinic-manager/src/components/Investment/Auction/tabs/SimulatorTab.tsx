'use client'
import { useState, useMemo } from 'react'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'
import { calculateSecondary, calculateTertiary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
  initialInput?: Partial<SimulatorInput>
  onSave?: (input: SimulatorInput) => Promise<void> | void
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

  // 시세 매칭이 없거나 사용자가 직접 입력하고 싶을 때 수동 시세를 받는다.
  const matchedPrice = market?.median_price_3m ?? market?.median_price_12m ?? null
  const [marketPriceInput, setMarketPriceInput] = useState<number | null>(matchedPrice)

  const secondary = useMemo(() => {
    if (!marketPriceInput || marketPriceInput <= 0) return null
    const effectiveMarket: MarketPrice = market
      ? { ...market, median_price_3m: marketPriceInput }
      : {
          source: 'manual',
          matched_complex: null,
          median_price_3m: marketPriceInput,
          trade_count_3m: null,
          median_price_12m: null,
          last_trade_date: null,
          match_confidence: 'low',
        }
    return calculateSecondary(item, effectiveMarket, {
      isMultiOwner: input.is_multi_owner,
      repairCost: input.repair_cost,
      unpaidDues: input.unpaid_dues,
    })
  }, [item, market, marketPriceInput, input.is_multi_owner, input.repair_cost, input.unpaid_dues])

  const tertiary = useMemo(() => calculateTertiary(item, input), [item, input])

  const set = <K extends keyof SimulatorInput>(k: K, v: SimulatorInput[K]) => setInput(p => ({ ...p, [k]: v }))

  // min_bid_price > appraisal_price * 1.1 인 비정상 케이스에서 슬라이더가 무너지지 않도록 가드.
  const bidSliderMin = item.min_bid_price
  const bidSliderMax = Math.max(bidSliderMin, Math.round(item.appraisal_price * 1.1))

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await onSave(input)
      setSaveMsg({ type: 'ok', text: '관심물건에 저장되었습니다.' })
    } catch (e: any) {
      setSaveMsg({ type: 'err', text: `저장 실패: ${e?.message ?? '알 수 없는 오류'}` })
    } finally {
      setSaving(false)
    }
  }

  const marketSourceLabel = marketPriceInput === null
    ? null
    : market && marketPriceInput === matchedPrice
      ? `자동 매칭 (${market.match_confidence}${market.matched_complex ? ', ' + market.matched_complex : ''})`
      : '직접 입력'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card space-y-5">
        <h3 className="text-base font-semibold text-at-text">입찰 시뮬레이션 입력</h3>

        <Slider label="응찰가" value={input.bid_price} min={bidSliderMin} max={bidSliderMax} step={100_000} format={(n) => `${fmt(n)}원`} onChange={(v) => set('bid_price', v)} />
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
          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-at-accent text-white font-semibold disabled:opacity-50"
            >
              {saving ? '저장 중...' : '관심물건에 저장'}
            </button>
            {saveMsg && (
              <p className={`mt-2 text-[13px] md:text-xs font-medium ${saveMsg.type === 'ok' ? 'text-[var(--at-success)]' : 'text-rose-600'}`}>
                {saveMsg.text}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card space-y-3">
          <h3 className="text-base font-semibold text-at-text">매도 시뮬</h3>
          <ManualMarketPriceInput
            value={marketPriceInput}
            onChange={setMarketPriceInput}
            placeholder={matchedPrice}
            hasMatchedMarket={!!market}
          />

          {secondary ? (
            <div>
              <Result label="예상 시세" value={`${fmt(secondary.expected_market_price)}원`} />
              <Result label="예상 매도차익" value={`${fmt(secondary.expected_resale_profit)}원`} accent={secondary.expected_resale_profit > 0 ? 'emerald' : 'rose'} />
              <Result label="단순 수익률" value={`${secondary.simple_roi_pct.toFixed(2)}%`} accent={secondary.simple_roi_pct > 0 ? 'emerald' : 'rose'} />
              {marketSourceLabel && (
                <p className="text-[13px] md:text-xs text-at-text-secondary mt-2">출처: {marketSourceLabel}</p>
              )}
            </div>
          ) : (
            <p className="text-[14px] md:text-sm text-at-text-secondary py-2 leading-relaxed">
              예상 시세를 입력하면 취득세·등기비 등 부대비용을 반영한 매도 수익을 계산합니다.
            </p>
          )}
        </div>

        <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
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
  const safeMax = Math.max(min, max)
  const safeValue = Math.min(Math.max(value, min), safeMax)
  const disabled = safeMax === min
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5 gap-2">
        <label className="text-[14px] md:text-sm font-semibold text-at-text">{label}</label>
        <span className="text-[14px] md:text-sm tabular-nums font-semibold text-at-text">{format(safeValue)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full disabled:opacity-50"
      />
    </div>
  )
}

function ManualMarketPriceInput({
  value, onChange, placeholder, hasMatchedMarket,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder: number | null
  hasMatchedMarket: boolean
}) {
  const [raw, setRaw] = useState(value !== null ? value.toString() : '')
  return (
    <div>
      <label className="block text-[14px] md:text-sm font-semibold text-at-text mb-1.5">
        예상 시세 {hasMatchedMarket ? '(자동 매칭값 수정 가능)' : '(직접 입력)'}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={raw}
          placeholder={placeholder !== null ? new Intl.NumberFormat('ko-KR').format(placeholder) : '예) 350000000'}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d]/g, '')
            setRaw(cleaned)
            const n = cleaned === '' ? null : Number(cleaned)
            onChange(n === null || Number.isNaN(n) ? null : n)
          }}
          className="flex-1 h-10 px-3 rounded-lg border border-at-border bg-at-surface-alt text-[14px] md:text-sm text-at-text tabular-nums focus:outline-none focus:ring-2 focus:ring-at-accent"
        />
        <span className="text-[13px] md:text-xs text-at-text-secondary shrink-0">원</span>
      </div>
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
