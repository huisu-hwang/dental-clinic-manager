/**
 * KR 종목 시가총액 정적 카탈로그.
 *
 * 데이터: src/data/kr-tickers-marketcap.json (scripts/fetch-kr-marketcap.mjs 산출물)
 *
 * 갱신: yahoo-finance2 시총은 변동이 크지 않아 분기별 1회 정도 수동 실행 권장.
 */

import catalog from '@/data/kr-tickers-marketcap.json'

export interface KRMarketCapEntry {
  ticker: string
  name: string
  market: 'KR'
  marketCap: number
}

const ALL: KRMarketCapEntry[] = catalog as KRMarketCapEntry[]

/** marketCap > 0 인 종목만 시총 내림차순 정렬한 인덱스 */
let _ranked: KRMarketCapEntry[] | null = null
function rankedList(): KRMarketCapEntry[] {
  if (_ranked) return _ranked
  _ranked = ALL.filter((e) => e.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
  return _ranked
}

let _rankByTicker: Map<string, number> | null = null
function rankIndex(): Map<string, number> {
  if (_rankByTicker) return _rankByTicker
  const m = new Map<string, number>()
  rankedList().forEach((e, i) => m.set(e.ticker, i + 1))
  _rankByTicker = m
  return m
}

/** 1-based 시가총액 순위 (없으면 null) */
export function getKRMarketCapRank(ticker: string): number | null {
  const t = (ticker ?? '').trim()
  if (!t) return null
  return rankIndex().get(t) ?? null
}

/** 시총 (없으면 null) */
export function getKRMarketCap(ticker: string): number | null {
  const e = ALL.find((x) => x.ticker === ticker)
  if (!e || e.marketCap <= 0) return null
  return e.marketCap
}

/** 카탈로그 전체 크기 */
export function getKRCatalogSize(): number {
  return ALL.length
}

/** 시총 상위 N개 (스크리너 universe 등 용도) */
export function topKRByMarketCap(n: number): KRMarketCapEntry[] {
  return rankedList().slice(0, Math.max(0, n))
}
