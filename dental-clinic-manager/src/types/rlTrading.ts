export type RLModelSource = 'finrl_pretrained' | 'sb3_pretrained' | 'custom'
export type RLModelKind = 'portfolio' | 'single_asset'
export type RLModelStatus = 'pending' | 'downloading' | 'ready' | 'failed' | 'archived'
export type RLAlgorithm = 'PPO' | 'A2C' | 'TD3' | 'DDPG' | 'DQN' | 'SAC'

export interface RLOutputShape {
  type: 'continuous' | 'discrete'
  dim: number
}

export interface RLModel {
  id: string
  user_id: string
  clinic_id: string
  name: string
  description?: string | null
  source: RLModelSource
  algorithm: RLAlgorithm
  kind: RLModelKind
  market: string
  timeframe: string
  universe: string[] | null
  input_features: string[]
  state_window: number
  output_shape: RLOutputShape
  checkpoint_url: string | null
  checkpoint_path: string | null
  checkpoint_sha256: string | null
  min_confidence: number
  status: RLModelStatus
  metrics: Record<string, unknown> | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface RLModelCreateInput {
  name: string
  description?: string
  source: RLModelSource
  algorithm: RLAlgorithm
  kind: RLModelKind
  market?: string
  timeframe?: string
  universe?: string[]
  input_features: string[]
  state_window: number
  output_shape: RLOutputShape
  checkpoint_url: string
  checkpoint_sha256: string
  min_confidence?: number
}

export type RLDecision =
  | 'order'
  | 'hold'
  | 'blocked_low_confidence'
  | 'blocked_kill_switch'
  | 'error'

export interface RLInferenceLog {
  id: string
  strategy_id: string
  rl_model_id: string
  user_id: string
  trade_date: string
  state_hash: string
  output: Record<string, unknown>
  confidence: number | null
  decision: RLDecision
  blocked_reason: string | null
  latency_ms: number | null
  error_message: string | null
  created_at: string
}
