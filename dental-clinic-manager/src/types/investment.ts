/**
 * 투자 자동거래 시스템 TypeScript 타입 정의
 */

// ============================================
// 공통 타입
// ============================================

export type Market = 'KR' | 'US'
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1w'
export type AutomationLevel = 1 | 2  // 1=알림만, 2=완전자동

// ============================================
// 증권사 계좌 (user_broker_credentials)
// ============================================

export interface BrokerCredential {
  id: string
  user_id: string
  broker: string
  account_number_encrypted: string  // JSON: {iv, encrypted, tag}
  app_key_encrypted: string
  app_secret_encrypted: string
  encryption_version: number
  is_paper_trading: boolean
  is_active: boolean
  label: string | null
  cached_access_token_encrypted: string | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
}

/** 계좌 연결 폼 입력값 */
export interface BrokerCredentialInput {
  appKey: string
  appSecret: string
  accountNumber: string
  isPaperTrading: boolean
  label?: string
}

/** 계좌 조회 응답 (민감 정보 제외) */
export interface BrokerCredentialSafe {
  id: string
  broker: string
  accountNumberMasked: string  // 예: "****1234"
  isPaperTrading: boolean
  isActive: boolean
  label: string | null
  createdAt: string
}

// ============================================
// 기술 지표 (Indicators)
// ============================================

export type IndicatorType =
  | 'RSI' | 'MACD' | 'SMA' | 'EMA'
  | 'BB'  // Bollinger Bands
  | 'STOCH'  // Stochastic
  | 'ATR' | 'ADX' | 'CCI'
  | 'WILLR'  // Williams %R
  | 'VOLUME_SMA'
  | 'FEAR_GREED'  // Fear & Greed Index (0~100, 실시간 시장 심리)
  | 'SMART_MONEY'  // 스마트머니 매집/분산 지표 (-100~+100, 중기)
  | 'DAILY_SMART_MONEY_PULSE'  // 일일 스마트머니 펄스 (-100~+100, 단기)
  // ===== 단타(Day Trading) 전용 분봉 지표 =====
  | 'VWAP'              // Volume Weighted Average Price (당일 누적 거래량 가중 평균가)
  | 'OPENING_RANGE'     // ORB (Opening Range Breakout) - 시초 N분 고/저
  | 'LARGE_BLOCK'       // 대형 거래 감지 (현재 봉 거래량 / 최근 N봉 평균 비율)
  | 'CLOSING_PRESSURE'  // 장 마감 압박 (마감 N봉 거래량 점유율 %)
  | 'INTRADAY_PULSE'    // 분봉판 일일 펄스 (-100~+100)

/** 전략 모드: swing(일봉/스윙) vs daytrading(분봉/단타) */
export type StrategyMode = 'swing' | 'daytrading'

export interface IndicatorConfig {
  id: string          // 예: 'RSI_14', 'SMA_20'
  type: IndicatorType
  params: Record<string, number>  // 예: { period: 14 }
}

// MACD 출력값
export interface MACDOutput {
  macd: number
  signal: number
  histogram: number
}

// 볼린저 밴드 출력값
export interface BBOutput {
  upper: number
  middle: number
  lower: number
}

// ============================================
// 조건 트리 (Condition Tree)
// ============================================

/** 지표값 참조 */
export interface IndicatorRef {
  type: 'indicator'
  id: string           // IndicatorConfig.id 참조
  property?: string    // 예: 'signal' (MACD), 'upper' (BB)
}

/** 상수값 */
export interface ConstantRef {
  type: 'constant'
  value: number
}

/** 비교 연산자 */
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | 'crossOver' | 'crossUnder'

/** 단일 비교 조건 (leaf) */
export interface ConditionLeaf {
  type: 'leaf'
  left: IndicatorRef | ConstantRef
  operator: ComparisonOperator
  right: IndicatorRef | ConstantRef
}

/** 복합 조건 그룹 (AND/OR 중첩 가능) */
export interface ConditionGroup {
  type: 'group'
  operator: 'AND' | 'OR'
  conditions: (ConditionLeaf | ConditionGroup)[]
}

/** 조건 노드 (Leaf 또는 Group) */
export type ConditionNode = ConditionLeaf | ConditionGroup

// ============================================
// 리스크 설정 (Risk Settings)
// ============================================

export interface RiskSettings {
  maxDailyLossPercent: number     // 일일 최대 손실율 (예: 2)
  maxPositions: number            // 최대 동시 보유 종목 수
  maxPositionSizePercent: number  // 종목당 최대 비중 (예: 20)
  stopLossPercent: number         // 손절 기준 (예: 5)
  takeProfitPercent: number       // 익절 기준 (예: 10)
  maxHoldingDays: number          // 최대 보유 기간 (0 = 무제한)
}

// ============================================
// 사용자별 자동매매 설정 (user_investment_settings)
// ============================================

/** DB Row */
export interface UserInvestmentSettings {
  user_id: string
  daily_loss_limit_enabled: boolean
  daily_loss_limit_percent: number
  entry_stop_loss_enabled: boolean
  entry_stop_loss_percent: number
  created_at: string
  updated_at: string
}

/** API/UI에서 사용하는 camelCase 형태 */
export interface UserInvestmentSettingsInput {
  dailyLossLimitEnabled: boolean
  dailyLossLimitPercent: number
  entryStopLossEnabled: boolean
  entryStopLossPercent: number
}

export const DEFAULT_USER_INVESTMENT_SETTINGS: UserInvestmentSettingsInput = {
  dailyLossLimitEnabled: false,
  dailyLossLimitPercent: 5,
  entryStopLossEnabled: false,
  entryStopLossPercent: 3,
}

// ============================================
// 투자 전략 (investment_strategies)
// ============================================

export interface InvestmentStrategy {
  id: string
  user_id: string
  name: string
  description: string | null
  target_market: Market
  timeframe: Timeframe
  /** 전략 모드 (옵셔널, 미설정 시 'swing'으로 간주) */
  mode?: StrategyMode
  indicators: IndicatorConfig[]
  buy_conditions: ConditionGroup
  sell_conditions: ConditionGroup
  risk_settings: RiskSettings
  automation_level: AutomationLevel
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
  rl_model_id?: string | null
  credential_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StrategyInput {
  name: string
  description?: string
  targetMarket: Market
  timeframe: Timeframe
  /** 전략 모드 (옵셔널, 미설정 시 'swing'으로 간주) */
  mode?: StrategyMode
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
  sellConditions: ConditionGroup
  /** @deprecated 사용자별 자동매매 설정으로 이전됨. 하위 호환을 위해 유지. */
  riskSettings?: RiskSettings
  automationLevel: AutomationLevel
  strategy_type?: 'rule' | 'rl_portfolio' | 'rl_single'  // default 'rule' on server side
  rl_model_id?: string | null
}

/** 백테스트 등 기존 로직 호환을 위한 무효화된 RiskSettings (모든 안전장치 비활성) */
export const NOOP_RISK_SETTINGS: RiskSettings = {
  maxDailyLossPercent: 0,
  maxPositions: 1,
  maxPositionSizePercent: 100,
  stopLossPercent: 0,
  takeProfitPercent: 0,
  maxHoldingDays: 0,
}

// ============================================
// 전략 감시 종목 (strategy_watchlist)
// ============================================

export interface StrategyWatchlistItem {
  id: string
  strategy_id: string
  ticker: string
  ticker_name: string | null
  market: Market
  is_active: boolean
  created_at: string
}

// ============================================
// 백테스트 (backtest_runs)
// ============================================

export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BacktestRun {
  id: string
  strategy_id: string
  user_id: string
  ticker: string
  market: Market
  start_date: string
  end_date: string
  initial_capital: number
  status: BacktestStatus
  claimed_at: string | null
  total_return: number | null
  annualized_return: number | null
  max_drawdown: number | null
  sharpe_ratio: number | null
  win_rate: number | null
  total_trades: number | null
  profit_factor: number | null
  equity_curve: EquityCurvePoint[] | null
  trades: BacktestTrade[] | null
  full_metrics: BacktestMetrics | null
  error_message: string | null
  executed_at: string
  completed_at: string | null
}

export interface EquityCurvePoint {
  date: string
  value: number
}

/** 매매 시점의 신호 근거 스냅샷 */
export interface SignalSnapshot {
  /** 신호 발생 사유 */
  reason: 'signal' | 'stopLoss' | 'takeProfit' | 'maxHolding' | 'forceClose'
  /** 신호 발생 봉의 모든 지표값 (id → 단일값 또는 객체) */
  indicators: Record<string, number | Record<string, number>>
  /** 매칭된 조건 leaf의 사람이 읽을 수 있는 표현 (예: "RSI_14(72.34) > 70") */
  matchedConditions: string[]
}

export interface BacktestTrade {
  entryDate: string
  exitDate: string
  ticker: string
  direction: 'buy' | 'sell'
  entryPrice: number
  exitPrice: number
  quantity: number
  pnl: number
  pnlPercent: number
  holdingDays: number
  /** 진입 시점의 신호 근거 (옵션, 신규 백테스트부터 채워짐) */
  entrySignal?: SignalSnapshot
  /** 청산 시점의 신호 근거 (옵션, 신규 백테스트부터 채워짐) */
  exitSignal?: SignalSnapshot
}

export interface BacktestMetrics {
  totalReturn: number
  annualizedReturn: number
  maxDrawdown: number
  sharpeRatio: number
  winRate: number
  totalTrades: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  avgHoldingDays: number
}

export interface BacktestRequest {
  strategyId: string
  ticker: string
  market: Market
  startDate: string
  endDate: string
  initialCapital: number
}

// ============================================
// 포지션 (positions)
// ============================================

export type PositionStatus = 'open' | 'closed'

export interface Position {
  id: string
  user_id: string
  credential_id: string | null
  strategy_id: string | null
  ticker: string
  market: Market
  quantity: number
  avg_entry_price: number
  realized_pnl: number
  status: PositionStatus
  opened_at: string
  closed_at: string | null
  updated_at: string
}

// ============================================
// 주문 (trade_orders)
// ============================================

export type OrderType = 'buy' | 'sell'
export type OrderMethod = 'limit' | 'market'
export type OrderStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'failed'

export interface TradeOrder {
  id: string
  user_id: string
  strategy_id: string | null
  credential_id: string | null
  position_id: string | null
  ticker: string
  market: Market
  order_type: OrderType
  order_method: OrderMethod
  quantity: number
  order_price: number | null
  executed_price: number | null
  executed_quantity: number
  status: OrderStatus
  kis_order_id: string | null
  pnl: number | null
  commission: number | null
  automation_level: AutomationLevel | null
  signal_data: Record<string, unknown> | null
  idempotency_key: string | null
  error_message: string | null
  created_at: string
  filled_at: string | null
}

export interface OrderInput {
  ticker: string
  market: Market
  orderType: OrderType
  orderMethod: OrderMethod
  quantity: number
  price?: number  // 시장가 주문 시 불필요
}

// ============================================
// 주가 캐시 (stock_price_cache)
// ============================================

export interface StockPrice {
  ticker: string
  market: Market
  timeframe: Timeframe
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** OHLCV 데이터 (차트/지표 계산용) */
export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================
// 시장 캘린더 (market_calendars)
// ============================================

export interface MarketCalendar {
  market: Market
  date: string
  is_holiday: boolean
  holiday_name: string | null
  market_open: string | null   // TIME 형식 (HH:mm)
  market_close: string | null
  timezone: string
}

// ============================================
// 감사 로그 (investment_audit_logs)
// ============================================

export type AuditAction =
  | 'credential_registered'
  | 'credential_deactivated'
  | 'credential_accessed'
  | 'credential_auth_failed'
  | 'strategy_created'
  | 'strategy_activated'
  | 'strategy_deactivated'
  | 'trade_created'
  | 'trade_filled'
  | 'trade_failed'
  | 'emergency_stop'
  | 'live_trading_enabled'
  | 'risk_limit_reached'

export interface InvestmentAuditLog {
  id: string
  user_id: string | null
  action: AuditAction
  resource_type: string | null
  resource_id: string | null
  status: 'success' | 'failure' | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

// ============================================
// KIS API 응답 타입
// ============================================

export interface KISTokenResponse {
  access_token: string
  access_token_token_expired: string  // "YYYY-MM-DD HH:mm:ss"
  token_type: string
  expires_in: number
}

export interface KISOrderResponse {
  rt_cd: string     // '0' = 성공
  msg_cd: string
  msg1: string
  output: {
    KRX_FWDG_ORD_ORGNO: string  // 한국거래소 주문조직번호
    ODNO: string                  // 주문번호
    ORD_TMD: string              // 주문시간
  }
}

export interface KISDailyPriceItem {
  stck_bsop_date: string   // 영업일자
  stck_oprc: string        // 시가
  stck_hgpr: string        // 고가
  stck_lwpr: string        // 저가
  stck_clpr: string        // 종가
  acml_vol: string         // 누적거래량
}

// ============================================
// UI 관련 타입
// ============================================

/** 손익 색상 모드 (한국식: 빨강=상승, 미국식: 녹색=상승) */
export type PnlColorMode = 'KR' | 'US'

/** 투자 대시보드 탭 */
export type InvestmentTab = 'dashboard' | 'strategy' | 'trading' | 'portfolio' | 'settings'

// ============================================
// 시장 단계 / 종목 추천
// ============================================

/** 시장 단계 분류 — 추세/변동성/모멘텀 3축 분석 결과 */
export type MarketRegime =
  | 'strong-uptrend'      // 강한 상승 추세 (가격 > SMA200, ADX 강)
  | 'weak-uptrend'        // 약한 상승 추세
  | 'sideways'            // 횡보 (낮은 ADX, 좁은 BB)
  | 'high-volatility'     // 변동성 확대 국면 (BB 확장, 높은 ATR)
  | 'downtrend'           // 하락 추세
  | 'oversold-bounce'     // 과매도 반등 가능 (RSI 매우 낮음)
  | 'overbought'          // 과매수 (RSI 매우 높음)

export interface MarketAnalysis {
  ticker: string
  market: Market
  asOf: string  // 분석 기준일 (마지막 봉 날짜)
  regime: MarketRegime
  metrics: {
    priceVsSMA200: number    // 종가/SMA200 - 1 (퍼센트)
    adx: number               // ADX(14) — 추세 강도
    rsi: number               // RSI(14)
    bbWidth: number           // 볼린저 밴드 폭 / 중심선 (%)
    atrPercent: number        // ATR(14) / 종가 (%)
    momentum6M: number        // 6개월 가격 변화율 (%)
    momentum1M: number        // 1개월 가격 변화율 (%)
  }
  /** 분류 근거 사람이 읽을 수 있는 설명 */
  reasoning: string[]
}

/** 추천 모드 */
export type RecommendationMode = 'rule' | 'hybrid' | 'backtest'

/** 추천 결과 단일 항목 */
export interface StrategyRecommendation {
  presetId: string
  presetName: string
  /** 0~100 점수 (높을수록 적합) */
  score: number
  /** 룰 기반 매칭 점수 (모든 모드에서 채워짐) */
  ruleScore: number
  /** 미니 백테스트 결과 (hybrid/backtest 모드일 때만) */
  backtest?: {
    totalReturn: number
    winRate: number
    sharpeRatio: number
    totalTrades: number
  }
  /** 추천 이유 */
  reasons: string[]
}

export interface RecommendationResult {
  analysis: MarketAnalysis
  mode: RecommendationMode
  recommendations: StrategyRecommendation[]
}

/** 프리셋 전략 */
export interface PresetStrategy {
  id: string
  name: string
  description: string
  /** 전략 모드 (옵셔널, 미설정 시 'swing'으로 간주) */
  mode?: StrategyMode
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
  sellConditions: ConditionGroup
  riskSettings: Partial<RiskSettings>
  /** 자세한 작동 원리 설명 (마크다운 가능) — 상세 페이지에서 표시 */
  longDescription?: string
  /** 적합한 종목 특성 (예: ["대형 우량주", "추세가 명확한 종목"]) */
  bestFor?: string[]
  /** 적합한 시장 상황 분류 (MarketRegime 값 배열) */
  marketConditions?: MarketRegime[]
  /** 평균 보유 기간 표현 (예: "1~3개월", "수일") */
  typicalHolding?: string
  /** 장점 목록 */
  pros?: string[]
  /** 단점/리스크 목록 */
  cons?: string[]
  /** 학술/저자 출처 */
  source?: string
}
