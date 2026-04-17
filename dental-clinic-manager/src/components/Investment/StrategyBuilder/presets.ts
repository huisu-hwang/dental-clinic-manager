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
]
