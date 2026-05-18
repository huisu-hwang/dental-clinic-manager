export type RegimeState = 'bull' | 'bear' | 'sideways' | 'crisis'
export type ScopeType = 'market' | 'sector' | 'ticker'

export interface ModelVote {
  state: RegimeState
  confidence: number
  probs: Record<RegimeState, number>
}

export interface RegimeRun {
  scope_type: ScopeType
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

export interface RegimeHistoryRow {
  date: string
  state: RegimeState
  confidence: number
}
