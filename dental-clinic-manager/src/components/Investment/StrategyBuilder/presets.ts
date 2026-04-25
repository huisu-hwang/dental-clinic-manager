/**
 * 프리셋 전략 (초보자용)
 */

import type { PresetStrategy } from '@/types/investment'

export const PRESET_STRATEGIES: PresetStrategy[] = [
  {
    id: 'rsi-oversold',
    name: 'RSI 과매도 반등',
    description: 'RSI가 30 이하일 때 매수, 70 이상일 때 매도하는 기본 전략',
    indicators: [
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 30 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 70 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 10,
    },
  },
  {
    id: 'golden-cross',
    name: '골든크로스',
    description: 'SMA 20일선이 SMA 50일선을 상향 돌파 시 매수, 하향 돌파 시 매도',
    indicators: [
      { id: 'SMA_20', type: 'SMA', params: { period: 20 } },
      { id: 'SMA_50', type: 'SMA', params: { period: 50 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMA_20' },
          operator: 'crossOver',
          right: { type: 'indicator', id: 'SMA_50' },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMA_20' },
          operator: 'crossUnder',
          right: { type: 'indicator', id: 'SMA_50' },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 7,
      takeProfitPercent: 15,
    },
  },
  {
    id: 'bb-bounce',
    name: '볼린저 밴드 하단 반등',
    description: '가격이 볼린저 밴드 하단에 닿으면 매수, 상단에 닿으면 매도',
    indicators: [
      { id: 'BB_20', type: 'BB', params: { period: 20, stdDev: 2 } },
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'BB_20', property: 'lower' },
          operator: '>',
          right: { type: 'constant', value: 0 }, // 플레이스홀더 (실제로는 가격 비교)
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 35 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 65 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 3,
      takeProfitPercent: 8,
    },
  },
  {
    id: 'macd-signal',
    name: 'MACD 시그널 크로스',
    description: 'MACD가 시그널선을 상향 돌파 시 매수, 하향 돌파 시 매도',
    indicators: [
      { id: 'MACD_12_26_9', type: 'MACD', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'MACD_12_26_9', property: 'macd' },
          operator: 'crossOver',
          right: { type: 'indicator', id: 'MACD_12_26_9', property: 'signal' },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'MACD_12_26_9', property: 'macd' },
          operator: 'crossUnder',
          right: { type: 'indicator', id: 'MACD_12_26_9', property: 'signal' },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 12,
    },
  },

  // ============================================
  // 대중 심리(Sentiment) 기반 전략
  // ============================================

  {
    id: 'panic-buy',
    name: '😱 패닉 매수 (역행 투자)',
    description: '대중이 극단적 공포에 빠졌을 때 매수 - RSI 과매도 + 거래량 급증',
    indicators: [
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
      { id: 'VOLUME_SMA_20', type: 'VOLUME_SMA', params: { period: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 극단 공포: RSI 25 이하 (보통 과매도는 30)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 25 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // RSI 60 이상 → 매도 (과열 직전에 조기 익절)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 60 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 8,
      takeProfitPercent: 15,
    },
  },

  {
    id: 'fomo-avoid',
    name: '🔥 FOMO 회피 (역행 투자)',
    description: '대중이 탐욕에 빠진 과열 시점에서 매도/회피 - 극단 과매수 감지',
    indicators: [
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
      { id: 'WILLR_14', type: 'WILLR', params: { period: 14 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 과열 아님 (RSI 50 이하)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 50 },
        },
        // Williams %R 과매도 (-80 이하)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'WILLR_14' },
          operator: '<',
          right: { type: 'constant', value: -80 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 극단 탐욕: RSI 75 이상
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 75 },
        },
        // Williams %R 과매수 (-20 이상)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'WILLR_14' },
          operator: '>',
          right: { type: 'constant', value: -20 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 6,
      takeProfitPercent: 12,
    },
  },

  {
    id: 'contrarian-extreme',
    name: '🎭 극단 역행 (Contrarian)',
    description: '2개 지표 동시 극단 시점 포착 - 대중이 모두 같은 방향일 때 반대 매매',
    indicators: [
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
      { id: 'STOCH_14_3', type: 'STOCH', params: { period: 14, signalPeriod: 3 } },
      { id: 'WILLR_14', type: 'WILLR', params: { period: 14 } },
    ],
    buyConditions: {
      // 3개 지표 모두 극단 과매도 (대중이 모두 팔고 있을 때)
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 30 },
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'STOCH_14_3', property: 'k' },
          operator: '<',
          right: { type: 'constant', value: 20 },
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'WILLR_14' },
          operator: '<',
          right: { type: 'constant', value: -80 },
        },
      ],
    },
    sellConditions: {
      // 3개 지표 중 1개라도 극단 과매수 (대중이 모두 살 때)
      type: 'group',
      operator: 'OR',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 70 },
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'STOCH_14_3', property: 'k' },
          operator: '>',
          right: { type: 'constant', value: 80 },
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'WILLR_14' },
          operator: '>',
          right: { type: 'constant', value: -20 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 7,
      takeProfitPercent: 14,
    },
  },

  {
    id: 'bb-panic-bounce',
    name: '💥 패닉 반등 (밴드 하단)',
    description: '대중 공포로 가격이 밴드 하단 이탈 → 반등 노림. 볼린저 밴드 + RSI 조합',
    indicators: [
      { id: 'BB_20_2', type: 'BB', params: { period: 20, stdDev: 2 } },
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
      { id: 'CCI_20', type: 'CCI', params: { period: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // RSI 극단 과매도
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 30 },
        },
        // CCI -100 이하 (극단 과매도)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'CCI_20' },
          operator: '<',
          right: { type: 'constant', value: -100 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // RSI 65 이상 (조기 익절)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 65 },
        },
        // CCI +100 이상 (과매수)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'CCI_20' },
          operator: '>',
          right: { type: 'constant', value: 100 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 10,
    },
  },

  {
    id: 'fear-greed-index',
    name: '📊 공포/탐욕 지수 역행',
    description: '합성 지수가 극단 공포(≤20)일 때 매수, 극단 탐욕(≥80)일 때 매도',
    indicators: [
      { id: 'FEAR_GREED_14_20_20_10', type: 'FEAR_GREED', params: { rsiPeriod: 14, bbPeriod: 20, volPeriod: 20, momentumPeriod: 10 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'FEAR_GREED_14_20_20_10' },
          operator: '<=',
          right: { type: 'constant', value: 20 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'FEAR_GREED_14_20_20_10' },
          operator: '>=',
          right: { type: 'constant', value: 80 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 8,
      takeProfitPercent: 15,
    },
  },

  // ============================================
  // 스마트머니 추종 전략 (Smart Money Tracking)
  // ============================================

  {
    id: 'smart-money-trend',
    name: '🐳 스마트머니 추세 추종 (중기)',
    description: 'CMF + Wyckoff Spring/Upthrust로 기관 매집 구간 진입, 분산 구간 회피',
    indicators: [
      { id: 'SMART_MONEY_20_20_10_10', type: 'SMART_MONEY', params: { cmfPeriod: 20, divergenceLookback: 20, springLookback: 10, upthrustLookback: 10 } },
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 강한 매집 신호
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMART_MONEY_20_20_10_10' },
          operator: '>',
          right: { type: 'constant', value: 30 },
        },
        // 과열 아님 (매집 초기 진입)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 65 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 분산 신호 (스마트머니 매도)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMART_MONEY_20_20_10_10' },
          operator: '<',
          right: { type: 'constant', value: -20 },
        },
        // 0선 하향 이탈 (모멘텀 전환)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMART_MONEY_20_20_10_10' },
          operator: 'crossUnder',
          right: { type: 'constant', value: 0 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 15,
      maxHoldingDays: 30,
    },
  },

  {
    id: 'smart-money-daily-pulse',
    name: '⚡ 스마트머니 일일 추종 (단타)',
    description: '강한 일일 매집 신호 시 매수, 다음날 펄스 약화 시 청산. 1~3일 단타',
    indicators: [
      { id: 'DAILY_SMART_MONEY_PULSE_20', type: 'DAILY_SMART_MONEY_PULSE', params: { volPeriod: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 강한 일일 매집 펄스
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'DAILY_SMART_MONEY_PULSE_20' },
          operator: '>',
          right: { type: 'constant', value: 50 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 펄스 약화 (매집 종료)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'DAILY_SMART_MONEY_PULSE_20' },
          operator: '<',
          right: { type: 'constant', value: 0 },
        },
        // 강한 분산 펄스 (즉시 청산)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'DAILY_SMART_MONEY_PULSE_20' },
          operator: '<',
          right: { type: 'constant', value: -30 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 2,
      takeProfitPercent: 3,
      maxHoldingDays: 3,
    },
  },

  {
    id: 'smart-money-combo',
    name: '💎 스마트머니 추세+펄스 결합 (정밀)',
    description: '중기 매집 추세(SMI > 30) + 당일 매집 강세(Pulse > 30) 동시 만족 시에만 진입',
    indicators: [
      { id: 'SMART_MONEY_20_20_10_10', type: 'SMART_MONEY', params: { cmfPeriod: 20, divergenceLookback: 20, springLookback: 10, upthrustLookback: 10 } },
      { id: 'DAILY_SMART_MONEY_PULSE_20', type: 'DAILY_SMART_MONEY_PULSE', params: { volPeriod: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMART_MONEY_20_20_10_10' },
          operator: '>',
          right: { type: 'constant', value: 30 },
        },
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'DAILY_SMART_MONEY_PULSE_20' },
          operator: '>',
          right: { type: 'constant', value: 30 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 일일 펄스 약화 (단기 익절/손절)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'DAILY_SMART_MONEY_PULSE_20' },
          operator: '<',
          right: { type: 'constant', value: -30 },
        },
        // 중기 추세 전환
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMART_MONEY_20_20_10_10' },
          operator: 'crossUnder',
          right: { type: 'constant', value: 0 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 4,
      takeProfitPercent: 12,
      maxHoldingDays: 14,
    },
  },

  {
    id: 'fear-greed-conservative',
    name: '🛡️ 공포/탐욕 보수적 진입',
    description: '공포 지수(≤25) + 가격 반등 확인 (SMA 5일선 상향 돌파)',
    indicators: [
      { id: 'FEAR_GREED_14_20_20_10', type: 'FEAR_GREED', params: { rsiPeriod: 14, bbPeriod: 20, volPeriod: 20, momentumPeriod: 10 } },
      { id: 'SMA_5', type: 'SMA', params: { period: 5 } },
      { id: 'SMA_20', type: 'SMA', params: { period: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'FEAR_GREED_14_20_20_10' },
          operator: '<=',
          right: { type: 'constant', value: 25 },
        },
        // 반등 확인: 5일선이 20일선을 상향 돌파
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMA_5' },
          operator: 'crossOver',
          right: { type: 'indicator', id: 'SMA_20' },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 탐욕 진입 시 매도
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'FEAR_GREED_14_20_20_10' },
          operator: '>=',
          right: { type: 'constant', value: 70 },
        },
        // 하락 추세 전환 시 매도
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'SMA_5' },
          operator: 'crossUnder',
          right: { type: 'indicator', id: 'SMA_20' },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 12,
    },
  },

  // ============================================
  // 단타 (Day Trading) 전략 - 분봉 기반
  // ============================================

  {
    id: 'day-vwap-bounce',
    name: '⚡ VWAP 반등 단타',
    description: '[단타/5분봉] 가격이 VWAP 아래에서 RSI 과매도 시 반등 매수, RSI 과열 또는 펄스 약화 시 청산',
    mode: 'daytrading',
    indicators: [
      { id: 'VWAP', type: 'VWAP', params: {} },
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
      { id: 'INTRADAY_PULSE_20', type: 'INTRADAY_PULSE', params: { volPeriod: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // RSI 과매도 (VWAP 아래에서 과매도 → 반등 가능성)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 35 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // RSI 과열 → 익절
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '>',
          right: { type: 'constant', value: 60 },
        },
        // 분봉 펄스 0선 하향 이탈 → 약세 전환
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'INTRADAY_PULSE_20' },
          operator: 'crossUnder',
          right: { type: 'constant', value: 0 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 1.5,
      takeProfitPercent: 2.5,
      maxHoldingDays: 12, // 5분봉 12봉 = 60분
    },
  },

  {
    id: 'day-orb-breakout',
    name: '🚀 Opening Range Breakout 단타',
    description: '[단타/5분봉] 장 시작 30분 고점 돌파 추정(강한 매집 펄스) 시 매수, 펄스 약화 시 청산',
    mode: 'daytrading',
    indicators: [
      { id: 'OPENING_RANGE_6', type: 'OPENING_RANGE', params: { numBars: 6 } }, // 5분봉 6봉 = 30분
      { id: 'INTRADAY_PULSE_20', type: 'INTRADAY_PULSE', params: { volPeriod: 20 } },
      { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 강한 매집 펄스 = ORB 돌파 추정 (가격-ORB.high 직접 비교는 현재 조건 트리 미지원)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'INTRADAY_PULSE_20' },
          operator: '>',
          right: { type: 'constant', value: 40 },
        },
        // 과열 아님 (RSI 75 미만)
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'RSI_14' },
          operator: '<',
          right: { type: 'constant', value: 75 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 펄스 약화 → 돌파 동력 소실
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'INTRADAY_PULSE_20' },
          operator: '<',
          right: { type: 'constant', value: 0 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 1.5,
      takeProfitPercent: 3,
      maxHoldingDays: 24, // 5분봉 24봉 = 2시간
    },
  },

  {
    id: 'day-closing-pressure',
    name: '🌙 마감 매집 단타',
    description: '[단타/5분봉] 장 마감 30분 거래량 급증 + 매집 펄스 강세 시 매수, 다음날 시가 청산',
    mode: 'daytrading',
    indicators: [
      { id: 'CLOSING_PRESSURE_6', type: 'CLOSING_PRESSURE', params: { lastNumBars: 6 } }, // 5분봉 6봉 = 30분
      { id: 'LARGE_BLOCK_20', type: 'LARGE_BLOCK', params: { period: 20 } },
      { id: 'INTRADAY_PULSE_20', type: 'INTRADAY_PULSE', params: { volPeriod: 20 } },
    ],
    buyConditions: {
      type: 'group',
      operator: 'AND',
      conditions: [
        // 마감 거래량 점유율이 평균보다 비정상적으로 높음
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'CLOSING_PRESSURE_6' },
          operator: '>',
          right: { type: 'constant', value: 25 },
        },
        // 매집 펄스 강세
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'INTRADAY_PULSE_20' },
          operator: '>',
          right: { type: 'constant', value: 30 },
        },
      ],
    },
    sellConditions: {
      type: 'group',
      operator: 'OR',
      conditions: [
        // 펄스 강한 분산 → 청산
        {
          type: 'leaf',
          left: { type: 'indicator', id: 'INTRADAY_PULSE_20' },
          operator: '<',
          right: { type: 'constant', value: -30 },
        },
      ],
    },
    riskSettings: {
      stopLossPercent: 1.5,
      takeProfitPercent: 2,
      maxHoldingDays: 6, // 5분봉 6봉 ≈ 다음 거래일 시가 도달 전 청산
    },
  },
]
