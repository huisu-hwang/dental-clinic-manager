import { describe, it, expect } from 'vitest'
import { calculatePrimary, calculateExtraCosts, calculateSecondary, calculateTertiary } from './roiCalculator'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'

const baseItem: AuctionItem = {
  id: 'i1',
  case_number: '2026타경12345',
  item_number: 1,
  court_name: '서울중앙지방법원',
  court_code: '00',
  property_type: 'apt',
  address_road: null, address_jibun: null,
  sido: '서울특별시', sigungu: '강남구', eupmyeondong: '도곡동',
  pnu: null,
  land_area_m2: null, building_area_m2: 84,
  floor: 10, total_floors: 25, building_year: 2010,
  appraisal_price: 1_200_000_000,
  min_bid_price: 840_000_000,
  bid_deposit: null,
  failure_count: 1,
  discount_rate: null,
  next_auction_date: null,
  status: 'active',
  sold_price: null, sold_at: null,
  source_url: null, notice_pdf_url: null, appraisal_pdf_url: null,
  photos: [], first_seen_at: '', last_synced_at: ''
}

describe('calculatePrimary', () => {
  it('할인율은 (감정가-최저가)/감정가 × 100 으로 계산된다', () => {
    const r = calculatePrimary(baseItem, '2026-05-09')
    expect(r.discount_rate_pct).toBeCloseTo(30.0, 1)
  })

  it('회차는 failure_count + 1 이다', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').round_no).toBe(2)
  })

  it('D-day가 null이면 null을 반환한다', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').d_day).toBeNull()
  })

  it('D-day는 매각기일 - today (양수)', () => {
    const r = calculatePrimary({ ...baseItem, next_auction_date: '2026-05-16' }, '2026-05-09')
    expect(r.d_day).toBe(7)
  })

  it('보증금은 최저가의 10%', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').bid_deposit).toBe(84_000_000)
  })

  it('명세서 표기 보증금이 있으면 그것을 사용', () => {
    const r = calculatePrimary({ ...baseItem, bid_deposit: 100_000_000 }, '2026-05-09')
    expect(r.bid_deposit).toBe(100_000_000)
  })

  it('㎡당 최저가는 면적이 0이면 null', () => {
    const r = calculatePrimary({ ...baseItem, building_area_m2: 0 }, '2026-05-09')
    expect(r.price_per_m2).toBeNull()
  })

  it('㎡당 최저가는 최저가/면적', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').price_per_m2).toBe(10_000_000)
  })
})

describe('calculateExtraCosts', () => {
  it('주거 1주택은 취득세 4.6%', () => {
    const c = calculateExtraCosts({ propertyType: 'apt', isMultiOwner: false, bidPrice: 1_000_000_000 })
    expect(c.acquisition_tax).toBe(46_000_000)
  })

  it('다주택은 취득세 12% (조정지역 가정)', () => {
    const c = calculateExtraCosts({ propertyType: 'apt', isMultiOwner: true, bidPrice: 1_000_000_000 })
    expect(c.acquisition_tax).toBe(120_000_000)
  })

  it('상가/오피스는 취득세 4.6%', () => {
    expect(calculateExtraCosts({ propertyType: 'commercial', isMultiOwner: false, bidPrice: 100_000_000 }).acquisition_tax).toBe(4_600_000)
  })

  it('토지는 취득세 4.6%', () => {
    expect(calculateExtraCosts({ propertyType: 'land', isMultiOwner: false, bidPrice: 100_000_000 }).acquisition_tax).toBe(4_600_000)
  })

  it('등기·법무비는 매수가의 0.7%', () => {
    expect(calculateExtraCosts({ propertyType: 'apt', isMultiOwner: false, bidPrice: 1_000_000_000 }).registration_fee).toBe(7_000_000)
  })
})

describe('calculateSecondary', () => {
  const market: MarketPrice = {
    source: 'molit_apt_trade',
    matched_complex: '도곡렉슬',
    median_price_3m: 1_080_000_000,
    trade_count_3m: 5,
    median_price_12m: 1_050_000_000,
    last_trade_date: '2026-04-15',
    match_confidence: 'high'
  }

  it('예상 시세는 median_price_3m을 우선 사용', () => {
    const s = calculateSecondary(baseItem, market, { isMultiOwner: false })
    expect(s!.expected_market_price).toBe(1_080_000_000)
  })

  it('median_price_3m이 null이면 12m fallback', () => {
    const s = calculateSecondary(baseItem, { ...market, median_price_3m: null }, { isMultiOwner: false })
    expect(s!.expected_market_price).toBe(1_050_000_000)
  })

  it('단순 수익률은 차익 / (입찰가+부대비용) × 100', () => {
    const s = calculateSecondary(baseItem, market, { isMultiOwner: false })
    expect(s!.simple_roi_pct).toBeCloseTo(22.10, 0)
  })

  it('match_confidence를 그대로 노출', () => {
    const s = calculateSecondary(baseItem, { ...market, match_confidence: 'mid' }, { isMultiOwner: false })
    expect(s!.match_confidence).toBe('mid')
  })
})

describe('calculateTertiary', () => {
  const input: SimulatorInput = {
    bid_price: 840_000_000,
    monthly_rent: 3_500_000,
    monthly_management_cost: 200_000,
    annual_property_tax: 4_000_000,
    repair_cost: 30_000_000,
    unpaid_dues: 0,
    is_multi_owner: false
  }

  it('연간 순임대수익 = (월세 - 관리비)*12 - 재산세', () => {
    const t = calculateTertiary(baseItem, input)
    expect(t.annual_net_rent).toBe(35_600_000)
  })

  it('총 투자비용 = 입찰가 + 부대비용 + 수리비', () => {
    const t = calculateTertiary(baseItem, input)
    expect(t.total_investment).toBe(914_520_000)
  })

  it('회수기간 = 총 투자비용 / 연간 순임대수익', () => {
    const t = calculateTertiary(baseItem, input)
    expect(t.payback_years).toBeCloseTo(25.69, 1)
  })

  it('연간 순임대수익이 0 이하면 회수기간은 null', () => {
    const t = calculateTertiary(baseItem, { ...input, monthly_rent: 0 })
    expect(t.payback_years).toBeNull()
  })
})
