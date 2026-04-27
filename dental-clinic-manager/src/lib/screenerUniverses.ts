/**
 * 스크리너 종목 풀(Universe) 정의
 *
 * 너무 큰 풀(2700+ KOSPI 전체)은 yahoo-finance2 rate limit과 응답 시간 문제로
 * 시가총액 상위 위주로 제한. 사용자가 모드 선택 가능.
 */

import type { Market } from '@/types/investment'
import { KR_TICKER_DICT } from './krTickerDict'
import { US_TICKER_DICT } from './usTickerDict'

export type UniverseId = 'KR_TOP' | 'US_TOP' | 'KR_ALL' | 'US_ALL' | 'ALL'

export interface UniverseEntry {
  ticker: string
  name: string
  market: Market
}

export interface UniverseDef {
  id: UniverseId
  label: string
  description: string
  entries: UniverseEntry[]
}

/** 국내 시가총액 상위 — krTickerDict 앞쪽 70개 (KOSPI 위주) */
const KR_TOP_TICKERS: UniverseEntry[] = KR_TICKER_DICT.slice(0, 70).map(e => ({
  ticker: e.ticker,
  name: e.name,
  market: 'KR',
}))

/** 미국 시가총액 상위 — usTickerDict 앞쪽 70개 */
const US_TOP_TICKERS: UniverseEntry[] = US_TICKER_DICT.slice(0, 70).map(e => ({
  ticker: e.ticker,
  name: e.name,
  market: 'US',
}))

/** 국내 전체 — krTickerDict 전체 매핑 */
const KR_ALL_TICKERS: UniverseEntry[] = KR_TICKER_DICT.map(e => ({
  ticker: e.ticker,
  name: e.name,
  market: 'KR',
}))

/** 미국 전체 — usTickerDict 전체 매핑 */
const US_ALL_TICKERS: UniverseEntry[] = US_TICKER_DICT.map(e => ({
  ticker: e.ticker,
  name: e.name,
  market: 'US',
}))

export const UNIVERSES: Record<UniverseId, UniverseDef> = {
  KR_TOP: {
    id: 'KR_TOP',
    label: '국내 시가총액 상위',
    description: 'KOSPI/KOSDAQ 시가총액 상위 70개',
    entries: KR_TOP_TICKERS,
  },
  US_TOP: {
    id: 'US_TOP',
    label: '미국 시가총액 상위',
    description: 'S&P 500 + 나스닥 시가총액 상위 70개',
    entries: US_TOP_TICKERS,
  },
  KR_ALL: {
    id: 'KR_ALL',
    label: '국내 전체',
    description: '국내 시총·거래량 상위 약 230개, 스캔 약 1~2분',
    entries: KR_ALL_TICKERS,
  },
  US_ALL: {
    id: 'US_ALL',
    label: '미국 전체',
    description: '미국 시총 상위 약 100개, 스캔 약 1분',
    entries: US_ALL_TICKERS,
  },
  ALL: {
    id: 'ALL',
    label: '전체 (KR + US)',
    description: '국내 + 미국 통합 약 328개, 스캔 약 2~3분',
    entries: [...KR_ALL_TICKERS, ...US_ALL_TICKERS],
  },
}

export function getUniverse(id: UniverseId): UniverseDef {
  return UNIVERSES[id] ?? UNIVERSES.KR_TOP
}
