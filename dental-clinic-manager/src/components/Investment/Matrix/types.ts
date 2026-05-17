export type PeriodWindow = '1Y' | '3Y' | '5Y' | '10Y'
export type MarketFilter = 'KR' | 'US' | 'ALL' | 'SPLIT'

export type SortKey =
  | 'avg_return'
  | 'avg_annualized'
  | 'avg_sharpe'
  | 'avg_mdd'
  | 'avg_winrate'
  | 'avg_profit_factor'
  | 'best_return'
  | 'worst_return'
  | 'sample_size'

export type SortDir = 'asc' | 'desc'

export interface MatrixRow {
  id: number
  entry_type: 'preset' | 'shared'
  entry_id: string
  market: 'KR' | 'US'
  ticker: string
  sector: string | null
  period_window: PeriodWindow
  start_date: string
  end_date: string
  initial_capital: number
  total_return: number | null
  annualized_return: number | null
  max_drawdown: number | null
  sharpe_ratio: number | null
  win_rate: number | null
  profit_factor: number | null
  total_trades: number | null
  buy_hold_return: number | null
  engine_version: string
  computed_at: string
  equity_curve_compact?: Array<{ d: string; e: number }>
}

export interface MatrixAggregateRow {
  entry_type: 'preset' | 'shared'
  entry_id: string
  market: 'KR' | 'US' | 'ALL'
  period_window: PeriodWindow
  sample_size: number
  avg_return: number | null
  std_return: number | null
  avg_annualized: number | null
  avg_sharpe: number | null
  avg_mdd: number | null
  avg_winrate: number | null
  avg_profit_factor: number | null
  best_return: number | null
  worst_return: number | null
  median_return: number | null
  positive_count: number
}
