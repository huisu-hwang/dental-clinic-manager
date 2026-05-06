-- ============================================
-- 종목 스크리너 실행 히스토리 (사용자별)
-- - screener_runs: 사용자가 실행한 스크리닝 결과 영속 저장
-- Migration: 20260506_screener_runs.sql
-- Created: 2026-05-06
-- ============================================

CREATE TABLE IF NOT EXISTS screener_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  status              VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled','error')),
  as_of_date          DATE NOT NULL,
  universe            VARCHAR(20) NOT NULL,
  universe_label      TEXT,
  realtime            BOOLEAN NOT NULL DEFAULT FALSE,
  total_tickers       INTEGER NOT NULL DEFAULT 0,
  total_matches       INTEGER NOT NULL DEFAULT 0,
  strategy_keys       TEXT[] NOT NULL DEFAULT '{}',
  strategy_names      JSONB NOT NULL DEFAULT '{}'::jsonb,
  matches_by_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  failed_by_strategy  JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_screener_runs_user_started
  ON screener_runs (user_id, started_at DESC);

ALTER TABLE screener_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "screener_runs_select_own" ON screener_runs;
CREATE POLICY "screener_runs_select_own" ON screener_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "screener_runs_insert_own" ON screener_runs;
CREATE POLICY "screener_runs_insert_own" ON screener_runs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "screener_runs_delete_own" ON screener_runs;
CREATE POLICY "screener_runs_delete_own" ON screener_runs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
