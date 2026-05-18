export type RegimeState = 'bull' | 'bear' | 'sideways' | 'crisis'

export const REGIME_LABEL: Record<RegimeState, string> = {
  bull: 'Bull',
  bear: 'Bear',
  sideways: 'Sideways',
  crisis: 'Crisis',
}

export const REGIME_LABEL_KO: Record<RegimeState, string> = {
  bull: '상승',
  bear: '하락',
  sideways: '횡보',
  crisis: '위기',
}

export const REGIME_EMOJI: Record<RegimeState, string> = {
  bull: '🟢',
  bear: '🔵',
  sideways: '🟡',
  crisis: '🔴',
}

export const REGIME_COLOR: Record<RegimeState, string> = {
  bull: '#10b981',
  bear: '#3b82f6',
  sideways: '#f59e0b',
  crisis: '#ef4444',
}

export interface ModelVote {
  state: RegimeState
  confidence: number
  probs: Record<RegimeState, number>
}

export interface RegimeRun {
  scope_type: 'market' | 'sector' | 'ticker'
  scope_id: string
  as_of_date: string
  current_state: RegimeState
  current_confidence: number
  state_probabilities: Record<RegimeState, number>
  model_votes: Record<string, ModelVote>
  transition_probabilities: {
    '5d'?: Record<RegimeState, number>
    '10d'?: Record<RegimeState, number>
    '30d'?: Record<RegimeState, number>
  }
  data_as_of: string
}
