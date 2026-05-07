// src/types/psychology.ts
import type { Market } from '@/types/investment'

export type PsychologyTriggerKind = 'manual' | 'price_change' | 'volume_spike'

export type PsychologyMarkerKind =
  | 'panic_sell'
  | 'fomo_entry'
  | 'accumulation'
  | 'distribution'
  | 'capitulation'
  | 'indecision'

export const PSYCHOLOGY_TAG_OPTIONS = [
  '패닉 셀링', 'FOMO 매수', '익절 압력', '누적 매집',
  '분산 매도', '관망', '반등 시도', '투매',
] as const
export type PsychologyTag = typeof PSYCHOLOGY_TAG_OPTIONS[number]

export interface PsychologyMarker {
  ts: string
  kind: PsychologyMarkerKind
  label: string
  candle_index: number
}

export interface PsychologyOrderbookPressure {
  bid_pct: number
  ask_pct: number
  interpretation: string
}

export interface PsychologyAnalysisOutput {
  psychology_score: number
  score_label: string
  tags: string[]
  narrative: string
  markers: PsychologyMarker[]
  orderbook_pressure: PsychologyOrderbookPressure | null
}

export interface PsychologyWatchlistItem {
  id: string
  user_id: string
  ticker: string
  market: Market
  monitoring_enabled: boolean
  trigger_price_change_pct: number | null
  trigger_volume_multiplier: number | null
  created_at: string
}

export interface PsychologySettings {
  user_id: string
  default_price_change_pct: number
  default_volume_multiplier: number
  push_notify_enabled: boolean
  cooldown_minutes: number
  updated_at: string
}

export interface PsychologyAnalysisRecord extends PsychologyAnalysisOutput {
  id: string
  user_id: string
  ticker: string
  market: Market
  trigger_kind: PsychologyTriggerKind
  input_snapshot: PsychologyInputSnapshot
  llm_model: string
  llm_latency_ms: number | null
  created_at: string
}

export interface MinuteCandle {
  ts: string  // ISO8601
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderbookSnapshot {
  bids: Array<{ price: number; qty: number }>
  asks: Array<{ price: number; qty: number }>
  totalBidQty: number
  totalAskQty: number
}

export interface PsychologyInputSnapshot {
  candles: MinuteCandle[]
  orderbook: OrderbookSnapshot | null
}
