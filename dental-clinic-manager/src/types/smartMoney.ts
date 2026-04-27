/**
 * 스마트머니(기관/외국인) 의도 추정 시스템 — 타입 정의
 *
 * - 분봉 데이터 + 외국인/기관 일별 매매 + 룰 기반 시그널 + 알고리즘 풋프린트
 *   (TWAP/VWAP/Iceberg/Sniper) 결합
 */

import type { Market } from './investment'

// ============================================
// 시그널 / 해석
// ============================================

export type SignalType =
  | 'spring' | 'upthrust' | 'absorption'
  | 'twap-distribution' | 'twap-accumulation'
  | 'vwap-distribution' | 'vwap-accumulation'
  | 'iceberg-buy' | 'iceberg-sell'
  | 'sniper-buy' | 'sniper-sell'
  | 'moo-accumulation' | 'moo-distribution'
  | 'moc-accumulation' | 'moc-distribution'
  | 'foreigner-accumulation' | 'foreigner-distribution'
  | 'institution-accumulation' | 'institution-distribution'

export type Interpretation =
  | 'strong-accumulation'
  | 'mild-accumulation'
  | 'neutral'
  | 'mild-distribution'
  | 'strong-distribution'

// ============================================
// 모듈별 결과
// ============================================

export interface VWAPResult {
  vwap: number
  /** (price-vwap)/vwap*100 — 백분율 거리 */
  distance: number
  zone: 'above' | 'below' | 'near'
  standardDeviation: number
}

export interface WyckoffResult {
  springDetected: boolean
  upthrustDetected: boolean
  /** 0~100 — 흡수(Absorption) 강도 */
  absorptionScore: number
  description: string
}

export interface AlgoFootprintResult {
  twapScore: number
  vwapScore: number
  icebergScore: number
  sniperScore: number
  /** Market-On-Open: 시가 동시호가 봉의 거래량 비중 (0~100) */
  mooScore: number
  /** Market-On-Close: 종가 동시호가 봉의 거래량 비중 (0~100) */
  mocScore: number
  dominantAlgo: 'TWAP' | 'VWAP' | 'Iceberg' | 'Sniper' | 'MOO' | 'MOC' | null
  direction: 'accumulation' | 'distribution' | 'neutral'
  /** MOO/MOC 발생 시의 방향성 (시·종가 동시호가 봉이 양봉/음봉 어느 쪽인지) */
  auctionDirection: 'moo-buy' | 'moo-sell' | 'moc-buy' | 'moc-sell' | null
}

export interface InvestorFlowResult {
  foreigner_net_today: number
  foreigner_net_5d: number
  foreigner_net_20d: number
  institution_net_today: number
  institution_net_5d: number
  institution_net_20d: number
  retail_net_5d: number
  signal: 'accumulation' | 'distribution' | 'neutral'
  confidence: number
}

export interface SignalDetail {
  type: SignalType
  /** 0~100 */
  confidence: number
  description: string
  triggeredAt?: string
}

// ============================================
// 종합 분석 결과
// ============================================

export interface SmartMoneyAnalysis {
  ticker: string
  market: Market
  name: string
  /** YYYY-MM-DD */
  asOfDate: string
  currentPrice: number
  vwap: VWAPResult
  investorFlow: InvestorFlowResult | null
  wyckoff: WyckoffResult
  algoFootprint: AlgoFootprintResult
  /** -100 ~ +100 (음수=분배 / 양수=매집) */
  overallScore: number
  interpretation: Interpretation
  signalDetails: SignalDetail[]
  naturalLanguageComment?: string
  /** ISO timestamp */
  generatedAt: string
}

// ============================================
// 알림 구독
// ============================================

export type NotificationMethod = 'inapp' | 'telegram' | 'push'

export interface SmartMoneyAlert {
  id: string
  user_id: string
  ticker: string
  market: Market
  ticker_name: string | null
  signal_types: SignalType[]
  min_confidence: number
  notification_methods: NotificationMethod[]
  enabled: boolean
  last_triggered_at: string | null
  created_at: string
}

// ============================================
// 시그널 로그
// ============================================

export interface SmartMoneySignalLogEntry {
  id: string
  user_id: string | null
  alert_id: string | null
  ticker: string
  market: Market
  signal_type: SignalType
  confidence: number
  payload: Record<string, unknown> | null
  detected_at: string
}

// ============================================
// DB Row (investor_trend)
// ============================================

export interface InvestorTrendRow {
  ticker: string
  market: Market
  date: string
  foreigner_net: number | null
  institution_net: number | null
  retail_net: number | null
  total_value: number | null
  fetched_at: string
}
