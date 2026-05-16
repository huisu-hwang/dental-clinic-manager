import type { MolitTrade } from './molitTradeClient.js'

export interface MatchInput {
  complexName: string | null
  areaM2: number | null
}

export interface MatchResult {
  matched_complex: string | null
  median_price_3m: number | null
  trade_count_3m: number
  median_price_12m: number | null
  last_trade_date: string | null
  match_confidence: 'high' | 'mid' | 'low'
}

export function matchMarketPrice(
  input: MatchInput,
  trades: MolitTrade[],
  todayISO: string
): MatchResult {
  if (!input.complexName || !input.areaM2 || trades.length === 0) {
    return emptyResult()
  }

  const today = new Date(todayISO)
  // 월 단위로 cutoff 산정 (ex: 2026-05-09 → 3개월 전 = 2026-02-01부터)
  const cutoff3m = new Date(today.getFullYear(), today.getMonth() - 3, 1)
  const cutoff12m = new Date(today.getFullYear(), today.getMonth() - 12, 1)

  // 단지명 정규화 비교. molit 응답은 "아스테라스 1단지" 처럼 부속 단지 번호를 붙이지만
  // 경매 지번 주소는 "아스테라스" 처럼 단지명만 들어오는 경우가 많다.
  // 정확히 일치하지 않아도 한쪽이 다른 쪽을 포함하면 같은 단지로 본다.
  const normalizedInput = normalize(input.complexName!)
  const sameComplex = trades.filter(t => {
    if (!t.apartmentName) return false
    const a = normalize(t.apartmentName)
    return a === normalizedInput || a.includes(normalizedInput) || normalizedInput.includes(a)
  })
  if (sameComplex.length === 0) return emptyResult()

  const matchedComplex = sameComplex[0].apartmentName

  const sameArea = sameComplex.filter(t => Math.abs(t.area - input.areaM2!) / input.areaM2! <= 0.05)
  if (sameArea.length === 0) return { ...emptyResult(), matched_complex: matchedComplex }

  const within3m = sameArea.filter(t => tradeDate(t) >= cutoff3m)
  const within12m = sameArea.filter(t => tradeDate(t) >= cutoff12m)

  const median3m = median(within3m.map(t => t.dealAmount * 10_000))
  const median12m = median(within12m.map(t => t.dealAmount * 10_000))

  const sortedDesc = [...sameArea].sort((a, b) => tradeDate(b).getTime() - tradeDate(a).getTime())
  const lastTrade = sortedDesc[0] ? toIso(tradeDate(sortedDesc[0])) : null

  let confidence: MatchResult['match_confidence'] = 'low'
  if (within3m.length >= 3) confidence = 'high'
  else if (within3m.length >= 1) confidence = 'mid'

  return {
    matched_complex: matchedComplex,
    median_price_3m: within3m.length > 0 ? median3m : null,
    trade_count_3m: within3m.length,
    median_price_12m: within12m.length > 0 ? median12m : null,
    last_trade_date: lastTrade,
    match_confidence: confidence,
  }
}

function emptyResult(): MatchResult {
  return {
    matched_complex: null,
    median_price_3m: null,
    trade_count_3m: 0,
    median_price_12m: null,
    last_trade_date: null,
    match_confidence: 'low',
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function tradeDate(t: MolitTrade): Date {
  return new Date(t.dealYear, t.dealMonth - 1, t.dealDay || 1)
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
