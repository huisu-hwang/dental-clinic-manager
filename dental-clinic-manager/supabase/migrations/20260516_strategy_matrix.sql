-- ============================================
-- 전략 비교 사전계산 매트릭스 시스템
-- Migration: 20260516_strategy_matrix.sql
-- Created: 2026-05-16
--
-- 배경: /investment/compare 가 매번 N×M 백테스트를 즉석 실행하던 것을,
--       Mac mini 야간 배치로 사전계산해두고 사용자가 시장/종목/기간/전략을
--       필터링해 즉시 조회하는 매트릭스 시스템으로 전환.
--
-- 정책:
--   Universe: KR_ALL(230) + US_ALL(1,000) = 1,230 종목
--   Window:   1Y / 3Y / 5Y / 10Y
--   Entry:    프리셋 31 + is_public 공유 전략
--   Worker:   Mac mini M4 Node 스크립트 (launchd 야간 19:00 KST)
--
-- 주의: `window` 는 PostgreSQL 예약어이므로 `period_window` 사용.
-- ============================================

CREATE TABLE IF NOT EXISTS strategy_matrix_runs (
  id BIGSERIAL PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('preset', 'shared')),
  entry_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  ticker TEXT NOT NULL,
  sector TEXT,
  period_window TEXT NOT NULL CHECK (period_window IN ('1Y', '3Y', '5Y', '10Y')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_capital NUMERIC NOT NULL DEFAULT 10000000,
  use_full_capital BOOLEAN NOT NULL DEFAULT TRUE,
  total_return NUMERIC,
  annualized_return NUMERIC,
  max_drawdown NUMERIC,
  sharpe_ratio NUMERIC,
  win_rate NUMERIC,
  profit_factor NUMERIC,
  total_trades INT,
  buy_hold_return NUMERIC,
  equity_curve_compact JSONB,
  engine_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_type, entry_id, market, ticker, period_window, engine_version)
);

CREATE INDEX IF NOT EXISTS idx_smr_market_window ON strategy_matrix_runs (market, period_window, entry_id);
CREATE INDEX IF NOT EXISTS idx_smr_ticker ON strategy_matrix_runs (ticker, period_window);
CREATE INDEX IF NOT EXISTS idx_smr_sector ON strategy_matrix_runs (market, sector, period_window);
CREATE INDEX IF NOT EXISTS idx_smr_market_return ON strategy_matrix_runs (market, period_window, total_return DESC);

CREATE TABLE IF NOT EXISTS strategy_matrix_jobs (
  id BIGSERIAL PRIMARY KEY,
  entry_type TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  period_window TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_type, entry_id, market, ticker, period_window)
);

CREATE INDEX IF NOT EXISTS idx_smj_status ON strategy_matrix_jobs (status, attempts);

DROP MATERIALIZED VIEW IF EXISTS strategy_matrix_market_stats;

CREATE MATERIALIZED VIEW strategy_matrix_market_stats AS
SELECT
  entry_type,
  entry_id,
  market,
  period_window,
  COUNT(*)::INT AS sample_size,
  AVG(total_return) AS avg_return,
  STDDEV(total_return) AS std_return,
  AVG(annualized_return) AS avg_annualized,
  AVG(sharpe_ratio) AS avg_sharpe,
  AVG(max_drawdown) AS avg_mdd,
  AVG(win_rate) AS avg_winrate,
  AVG(profit_factor) AS avg_profit_factor,
  MAX(total_return) AS best_return,
  MIN(total_return) AS worst_return,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_return) AS median_return,
  COUNT(*) FILTER (WHERE total_return > 0)::INT AS positive_count,
  MAX(end_date) AS last_computed_window_end
FROM strategy_matrix_runs
GROUP BY entry_type, entry_id, market, period_window;

CREATE UNIQUE INDEX idx_smms_key ON strategy_matrix_market_stats (entry_type, entry_id, market, period_window);
CREATE INDEX idx_smms_rank ON strategy_matrix_market_stats (market, period_window, avg_return DESC);

ALTER TABLE strategy_matrix_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_matrix_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smr_select_authenticated ON strategy_matrix_runs;
CREATE POLICY smr_select_authenticated ON strategy_matrix_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS smj_select_authenticated ON strategy_matrix_jobs;
CREATE POLICY smj_select_authenticated ON strategy_matrix_jobs FOR SELECT TO authenticated USING (true);
