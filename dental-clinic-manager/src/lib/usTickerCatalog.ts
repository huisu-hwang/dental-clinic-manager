/**
 * 미국 전체 상장 종목 정적 카탈로그 (NASDAQ + NYSE + AMEX, 약 7,000개).
 *
 * - 검색 우선순위:
 *   1) ticker 정확 일치
 *   2) ticker prefix (대문자)
 *   3) name prefix (대소문자 무시)
 *   4) name substring
 *
 * - yahoo-finance2 search는 종목당 50개 limit이라 longtail/소형주가 누락됨.
 *   카탈로그를 먼저 사용하면 더 폭넓게 매칭 가능.
 *
 * 갱신: scripts/fetch-us-tickers.mjs 수동 실행 → src/data/us-tickers.json 갱신.
 */

import catalog from '@/data/us-tickers.json'

export interface USTickerEntry {
  ticker: string
  name: string
  exchange: string
  isETF: boolean
  /** 달러 기준 시가총액 (rreichel3 카탈로그 marketCap, 0이면 미상) */
  marketCap?: number
  sector?: string | null
}

const ALL: USTickerEntry[] = catalog as USTickerEntry[]

/** 대문자 ticker 인덱스 (정확 일치 O(1)) */
const BY_TICKER: Map<string, USTickerEntry> = (() => {
  const m = new Map<string, USTickerEntry>()
  for (const e of ALL) m.set(e.ticker, e)
  return m
})()

/**
 * 카탈로그 검색.
 * - query는 trim + uppercase 비교 (영문/숫자/. 만 의미)
 * - 한글이면 빈 배열 (yahoo + krTickerDict가 처리)
 */
export function searchUSCatalog(query: string, limit = 30): USTickerEntry[] {
  const q = (query ?? '').trim()
  if (!q) return []
  // 한글 자모/완성형 검출 — yahoo 한글 미지원 + 본 카탈로그 영문만 보유
  if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(q)) return []

  const upper = q.toUpperCase()
  const lower = q.toLowerCase()

  const exact: USTickerEntry[] = []
  const prefixT: USTickerEntry[] = []
  const prefixN: USTickerEntry[] = []
  const substN: USTickerEntry[] = []

  // ticker 정확 일치 — O(1)
  const exactHit = BY_TICKER.get(upper)
  if (exactHit) exact.push(exactHit)

  for (const e of ALL) {
    if (e === exactHit) continue
    const tickerUp = e.ticker
    const nameLow = e.name.toLowerCase()
    if (tickerUp.startsWith(upper)) {
      prefixT.push(e)
      if (prefixT.length + exact.length >= limit) break
      continue
    }
    if (nameLow.startsWith(lower)) {
      prefixN.push(e)
    } else if (nameLow.includes(lower)) {
      substN.push(e)
    }
  }

  const merged = [...exact, ...prefixT, ...prefixN, ...substN]
  return merged.slice(0, limit)
}

/** ticker 단일 조회 (대문자) */
export function getUSCatalogEntry(ticker: string): USTickerEntry | undefined {
  return BY_TICKER.get((ticker ?? '').toUpperCase())
}

export function getCatalogSize(): number {
  return ALL.length
}

/** 시가총액(>0) 보유 종목을 내림차순 정렬해 반환 (스크리너 universe 등 용도) */
let _sorted: USTickerEntry[] | null = null
function sortedByMarketCap(): USTickerEntry[] {
  if (_sorted) return _sorted
  _sorted = ALL.filter((e) => (e.marketCap ?? 0) > 0 && !e.isETF)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
  return _sorted
}

/** 시총 상위 N개 — 스크리너 universe 입력용 */
export function topByMarketCap(n: number): USTickerEntry[] {
  return sortedByMarketCap().slice(0, Math.max(0, n))
}
