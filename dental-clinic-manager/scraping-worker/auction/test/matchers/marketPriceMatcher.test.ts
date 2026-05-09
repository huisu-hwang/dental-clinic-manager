import { describe, it, expect } from 'vitest'
import { matchMarketPrice } from '../../src/matchers/marketPriceMatcher.js'
import type { MolitTrade } from '../../src/matchers/molitTradeClient.js'

const trades: MolitTrade[] = [
  { dealAmount: 110000, dealYear: 2026, dealMonth: 4, dealDay: 10, apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 10 },
  { dealAmount: 108000, dealYear: 2026, dealMonth: 3, dealDay: 5,  apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 11 },
  { dealAmount: 105000, dealYear: 2026, dealMonth: 2, dealDay: 1,  apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 12 },
]

describe('matchMarketPrice', () => {
  it('단지명 + 면적이 일치하는 거래만 사용한다', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, trades, '2026-05-09')
    expect(r.median_price_3m).toBe(108_000 * 10_000)
    expect(r.trade_count_3m).toBe(3)
    expect(r.match_confidence).toBe('high')
  })

  it('거래수가 1~2건이면 mid', () => {
    const t = [trades[0]]
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, t, '2026-05-09')
    expect(r.match_confidence).toBe('mid')
  })

  it('거래수가 0이면 12개월로 fallback (있으면)', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, [], '2026-05-09')
    expect(r.median_price_3m).toBeNull()
    expect(r.median_price_12m).toBeNull()
    expect(r.match_confidence).toBe('low')
  })

  it('단지명 매칭 안되면 모두 null', () => {
    const r = matchMarketPrice({ complexName: '없는단지', areaM2: 84.5 }, trades, '2026-05-09')
    expect(r.median_price_3m).toBeNull()
    expect(r.matched_complex).toBeNull()
  })

  it('면적 ±5% 이내 매칭 허용', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 86.0 }, trades, '2026-05-09')
    expect(r.trade_count_3m).toBe(3)
  })
})
