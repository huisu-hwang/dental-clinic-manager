-- ============================================
-- 전략 랭킹 사전 집계 테이블 + 트리거
--
-- 목적: 랭킹 API 가 매 호출마다 70k+ rows fetch + JS 집계로 수 초 소요되던 문제 해결.
-- 백테스트가 완료될 때마다 (entry_type, entry_id, market) 별 통계를 trigger 로
-- 즉시 재계산해 저장. 랭킹 API 는 이 테이블만 SELECT 하면 됨.
-- ============================================

CREATE TABLE IF NOT EXISTS strategy_ranking_stats (
  entry_type TEXT NOT NULL CHECK (entry_type IN ('shared', 'preset')),
  entry_id TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  runs INTEGER NOT NULL DEFAULT 0,
  ticker_count INTEGER NOT NULL DEFAULT 0,
  avg_return NUMERIC,
  best_return NUMERIC,
  worst_return NUMERIC,
  avg_win_rate NUMERIC,
  avg_sharpe NUMERIC,
  avg_mdd NUMERIC,
  avg_pf NUMERIC,
  total_trades INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_type, entry_id, market)
);

CREATE INDEX IF NOT EXISTS idx_srs_market_avg_return ON strategy_ranking_stats(market, avg_return DESC);
CREATE INDEX IF NOT EXISTS idx_srs_runs ON strategy_ranking_stats(runs);
CREATE INDEX IF NOT EXISTS idx_srs_updated ON strategy_ranking_stats(updated_at DESC);

ALTER TABLE strategy_ranking_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_ranking_stats" ON strategy_ranking_stats;
CREATE POLICY "anyone_can_read_ranking_stats" ON strategy_ranking_stats
  FOR SELECT USING (true);

-- ============================================
-- backtest_runs INSERT/UPDATE → stats 행 재계산
-- ============================================
CREATE OR REPLACE FUNCTION refresh_strategy_ranking_stats() RETURNS TRIGGER AS $$
DECLARE
  v_entry_type TEXT;
  v_entry_id TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.market NOT IN ('KR', 'US') THEN
    RETURN NEW;
  END IF;

  IF NEW.strategy_id IS NOT NULL THEN
    v_entry_type := 'shared';
    v_entry_id := NEW.strategy_id::TEXT;
  ELSIF NEW.preset_id IS NOT NULL AND NEW.preset_id NOT IN ('custom', '') THEN
    v_entry_type := 'preset';
    v_entry_id := NEW.preset_id;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO strategy_ranking_stats (
    entry_type, entry_id, market,
    runs, ticker_count,
    avg_return, best_return, worst_return,
    avg_win_rate, avg_sharpe, avg_mdd, avg_pf,
    total_trades, last_run_at, updated_at
  )
  SELECT
    v_entry_type, v_entry_id, NEW.market,
    COUNT(*),
    COUNT(DISTINCT ticker),
    AVG(total_return),
    MAX(total_return),
    MIN(total_return),
    AVG(win_rate),
    AVG(sharpe_ratio),
    AVG(max_drawdown),
    AVG(profit_factor) FILTER (WHERE profit_factor IS NOT NULL AND profit_factor > 0 AND profit_factor < 1e6),
    COALESCE(SUM(total_trades), 0),
    MAX(executed_at),
    NOW()
  FROM backtest_runs
  WHERE status = 'completed'
    AND market = NEW.market
    AND CASE
      WHEN v_entry_type = 'shared' THEN strategy_id::TEXT = v_entry_id
      ELSE preset_id = v_entry_id
    END
  ON CONFLICT (entry_type, entry_id, market) DO UPDATE SET
    runs = EXCLUDED.runs,
    ticker_count = EXCLUDED.ticker_count,
    avg_return = EXCLUDED.avg_return,
    best_return = EXCLUDED.best_return,
    worst_return = EXCLUDED.worst_return,
    avg_win_rate = EXCLUDED.avg_win_rate,
    avg_sharpe = EXCLUDED.avg_sharpe,
    avg_mdd = EXCLUDED.avg_mdd,
    avg_pf = EXCLUDED.avg_pf,
    total_trades = EXCLUDED.total_trades,
    last_run_at = EXCLUDED.last_run_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_backtest_runs_refresh_ranking_stats ON backtest_runs;
CREATE TRIGGER trg_backtest_runs_refresh_ranking_stats
  AFTER INSERT OR UPDATE OF status, total_return, win_rate, sharpe_ratio, max_drawdown, profit_factor, total_trades
  ON backtest_runs
  FOR EACH ROW
  EXECUTE FUNCTION refresh_strategy_ranking_stats();

-- ============================================
-- 초기 백필 (기존 backtest_runs 일괄 집계)
-- ============================================
INSERT INTO strategy_ranking_stats (
  entry_type, entry_id, market,
  runs, ticker_count,
  avg_return, best_return, worst_return,
  avg_win_rate, avg_sharpe, avg_mdd, avg_pf,
  total_trades, last_run_at, updated_at
)
SELECT
  'shared',
  strategy_id::TEXT,
  market,
  COUNT(*),
  COUNT(DISTINCT ticker),
  AVG(total_return),
  MAX(total_return),
  MIN(total_return),
  AVG(win_rate),
  AVG(sharpe_ratio),
  AVG(max_drawdown),
  AVG(profit_factor) FILTER (WHERE profit_factor IS NOT NULL AND profit_factor > 0 AND profit_factor < 1e6),
  COALESCE(SUM(total_trades), 0),
  MAX(executed_at),
  NOW()
FROM backtest_runs
WHERE status = 'completed'
  AND strategy_id IS NOT NULL
  AND market IN ('KR', 'US')
GROUP BY strategy_id, market
ON CONFLICT (entry_type, entry_id, market) DO UPDATE SET
  runs = EXCLUDED.runs,
  ticker_count = EXCLUDED.ticker_count,
  avg_return = EXCLUDED.avg_return,
  best_return = EXCLUDED.best_return,
  worst_return = EXCLUDED.worst_return,
  avg_win_rate = EXCLUDED.avg_win_rate,
  avg_sharpe = EXCLUDED.avg_sharpe,
  avg_mdd = EXCLUDED.avg_mdd,
  avg_pf = EXCLUDED.avg_pf,
  total_trades = EXCLUDED.total_trades,
  last_run_at = EXCLUDED.last_run_at,
  updated_at = NOW();

INSERT INTO strategy_ranking_stats (
  entry_type, entry_id, market,
  runs, ticker_count,
  avg_return, best_return, worst_return,
  avg_win_rate, avg_sharpe, avg_mdd, avg_pf,
  total_trades, last_run_at, updated_at
)
SELECT
  'preset',
  preset_id,
  market,
  COUNT(*),
  COUNT(DISTINCT ticker),
  AVG(total_return),
  MAX(total_return),
  MIN(total_return),
  AVG(win_rate),
  AVG(sharpe_ratio),
  AVG(max_drawdown),
  AVG(profit_factor) FILTER (WHERE profit_factor IS NOT NULL AND profit_factor > 0 AND profit_factor < 1e6),
  COALESCE(SUM(total_trades), 0),
  MAX(executed_at),
  NOW()
FROM backtest_runs
WHERE status = 'completed'
  AND preset_id IS NOT NULL
  AND preset_id NOT IN ('custom', '')
  AND market IN ('KR', 'US')
GROUP BY preset_id, market
ON CONFLICT (entry_type, entry_id, market) DO UPDATE SET
  runs = EXCLUDED.runs,
  ticker_count = EXCLUDED.ticker_count,
  avg_return = EXCLUDED.avg_return,
  best_return = EXCLUDED.best_return,
  worst_return = EXCLUDED.worst_return,
  avg_win_rate = EXCLUDED.avg_win_rate,
  avg_sharpe = EXCLUDED.avg_sharpe,
  avg_mdd = EXCLUDED.avg_mdd,
  avg_pf = EXCLUDED.avg_pf,
  total_trades = EXCLUDED.total_trades,
  last_run_at = EXCLUDED.last_run_at,
  updated_at = NOW();
