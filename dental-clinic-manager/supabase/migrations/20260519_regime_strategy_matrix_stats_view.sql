-- ============================================
-- Regime × Strategy Matrix 통계 머티리얼라이즈드 뷰
-- Created: 2026-05-19
--
-- best-strategies API 가속 (35K row 그룹 집계 23s → 289ms)
-- 인덱스 (market, period_window, state, avg_return DESC) 로 Top N 즉시 조회
-- 일배치 종료 시 REFRESH MATERIALIZED VIEW CONCURRENTLY 권장
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS regime_strategy_stats AS
SELECT
  market,
  period_window,
  regime_at_window_end AS state,
  entry_id,
  COUNT(*) AS sample_size,
  AVG(total_return) AS avg_return,
  AVG(sharpe_ratio) AS avg_sharpe,
  AVG(max_drawdown) AS avg_mdd,
  AVG(win_rate) AS avg_winrate
FROM strategy_matrix_runs
WHERE regime_at_window_end IS NOT NULL
GROUP BY market, period_window, regime_at_window_end, entry_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_strategy_stats_pk
  ON regime_strategy_stats (market, period_window, state, entry_id);

CREATE INDEX IF NOT EXISTS idx_regime_strategy_stats_return
  ON regime_strategy_stats (market, period_window, state, avg_return DESC);
