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
  // ===== 정교화 시그널 (2026-04 추가) =====
  // 유동성 사냥
  | 'liquidity-sweep-bullish' | 'liquidity-sweep-bearish'
  // SMC 시장구조
  | 'choch-bullish' | 'choch-bearish'
  | 'bos-bullish' | 'bos-bearish'
  // 오더블록 / FVG
  | 'order-block-bullish' | 'order-block-bearish'
  | 'fvg-bullish' | 'fvg-bearish'
  // 트랩
  | 'bull-trap' | 'bear-trap'
  // VSA
  | 'no-demand' | 'no-supply'
  | 'buying-climax' | 'selling-climax' | 'stopping-volume'
  // PO3 / 세션
  | 'judas-swing' | 'po3-accumulation' | 'po3-distribution'
  // 뉴스
  | 'news-fade' | 'sell-the-news' | 'bad-news-accumulation'
  // 와이코프 페이즈 이벤트
  | 'wyckoff-phase-c' | 'wyckoff-sos' | 'wyckoff-lps'
  | 'wyckoff-utad' | 'wyckoff-sow' | 'wyckoff-lpsy'

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
// 정교화 엔진 결과 인터페이스 (2026-04 추가)
// ============================================

export type WyckoffPhase = 'A' | 'B' | 'C' | 'D' | 'E' | null
export type WyckoffCycle = 'accumulation' | 'distribution' | null

export interface WyckoffPhaseEvent {
  type: 'PS' | 'SC' | 'AR' | 'ST' | 'Spring' | 'Test' | 'SOS' | 'LPS'
      | 'PSY' | 'BC' | 'UTAD' | 'SOW' | 'LPSY'
  barIndex: number
  price: number
  description: string
}

export interface WyckoffPhaseResult {
  cycle: WyckoffCycle
  phase: WyckoffPhase
  events: WyckoffPhaseEvent[]
  confidence: number
  description: string
}

export interface LiquidityPool {
  level: number
  type: 'equal-highs' | 'equal-lows' | 'pdh' | 'pdl' | 'swing-high' | 'swing-low'
  hits: number
  swept: boolean
}

export interface SweepEvent {
  direction: 'bullish-sweep' | 'bearish-sweep'
  level: number
  barIndex: number
  wickRatio: number
  volumeSpike: number
  recoveredInside: boolean
  description: string
}

export interface LiquidityResult {
  pools: LiquidityPool[]
  recentSweeps: SweepEvent[]
  description: string
}

export type StructureTrend = 'bullish' | 'bearish' | 'range'
export type StructureEventType = 'BOS' | 'CHoCH' | null

export interface SwingPoint {
  barIndex: number
  price: number
  kind: 'HH' | 'HL' | 'LH' | 'LL'
}

export interface MarketStructureResult {
  trend: StructureTrend
  lastEvent: StructureEventType
  lastEventDirection: 'bullish' | 'bearish' | null
  swings: SwingPoint[]
  description: string
}

export interface OrderBlock {
  barIndex: number
  high: number
  low: number
  direction: 'bullish' | 'bearish'
  mitigated: boolean
}

export interface FairValueGap {
  startBarIndex: number
  top: number
  bottom: number
  direction: 'bullish' | 'bearish'
  filled: boolean
}

export interface OrderBlockFvgResult {
  orderBlocks: OrderBlock[]
  fvgs: FairValueGap[]
  description: string
}

export interface TrapDetail {
  type: 'bull-trap' | 'bear-trap'
  breakoutBarIndex: number
  level: number
  reclaimedBarIndex: number
  volumeDivergence: boolean
  description: string
}

export interface TrapResult {
  bullTrapDetected: boolean
  bearTrapDetected: boolean
  details: TrapDetail[]
  description: string
}

export interface VSASignalEntry {
  type: 'no-demand' | 'no-supply' | 'buying-climax' | 'selling-climax' | 'stopping-volume'
  barIndex: number
  confidence: number
  description: string
}

export interface VSAResult {
  signals: VSASignalEntry[]
  effortVsResult: 'bullish' | 'bearish' | 'neutral'
  description: string
}

export type MarketSession = 'pre-market' | 'open-30m' | 'midday' | 'close-30m'
                          | 'asia' | 'london' | 'london-ny-overlap' | 'ny' | 'after-hours'

export interface SessionResult {
  currentSession: MarketSession | null
  judasSwingDetected: boolean
  judasSwingDirection: 'bullish-fake' | 'bearish-fake' | null
  po3Pattern: 'po3-accumulation' | 'po3-distribution' | null
  description: string
}

export interface NewsEventInput {
  /** ISO timestamp */
  timestamp: string
  impact: 'low' | 'medium' | 'high'
  sentiment?: 'positive' | 'negative' | 'neutral'
  title?: string
}

export interface NewsContextResult {
  recentEvents: NewsEventInput[]
  /** signalDetails 중 뉴스 ±10분 윈도우에 걸린 시그널 인덱스 */
  affectedSignalIndices: number[]
  pattern: 'news-fade' | 'sell-the-news' | 'bad-news-accumulation' | null
  description: string
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
  // ===== 정교화 엔진 (옵션 — 하위 호환) =====
  wyckoffPhase?: WyckoffPhaseResult
  liquidity?: LiquidityResult
  marketStructure?: MarketStructureResult
  orderBlocksFvg?: OrderBlockFvgResult
  traps?: TrapResult
  vsa?: VSAResult
  session?: SessionResult
  newsContext?: NewsContextResult
  /** 0~100 — 시장 조작 위험도 (UI 노출용) */
  manipulationRiskScore?: number
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
