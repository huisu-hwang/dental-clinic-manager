-- ============================================
-- 군중심리 분석 (psychology_*)
-- 자동매매 사용자 대상 LLM 기반 군중심리 분석 기능
-- ============================================

CREATE TABLE IF NOT EXISTS psychology_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_price_change_pct NUMERIC NULL,
  trigger_volume_multiplier NUMERIC NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ticker, market)
);

CREATE TABLE IF NOT EXISTS psychology_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_price_change_pct NUMERIC NOT NULL DEFAULT 2.0,
  default_volume_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  push_notify_enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS psychology_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','price_change','volume_spike')),
  psychology_score INT NOT NULL CHECK (psychology_score BETWEEN 0 AND 100),
  score_label TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  narrative TEXT NOT NULL,
  markers JSONB NOT NULL,
  orderbook_pressure JSONB NULL,
  input_snapshot JSONB NOT NULL,
  llm_model TEXT NOT NULL,
  llm_latency_ms INT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psy_analyses_user_ticker_time
  ON psychology_analyses (user_id, ticker, created_at DESC);

ALTER TABLE psychology_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychology_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychology_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psy_watchlist_select_own ON psychology_watchlist;
DROP POLICY IF EXISTS psy_watchlist_insert_own ON psychology_watchlist;
DROP POLICY IF EXISTS psy_watchlist_update_own ON psychology_watchlist;
DROP POLICY IF EXISTS psy_watchlist_delete_own ON psychology_watchlist;

CREATE POLICY psy_watchlist_select_own ON psychology_watchlist
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY psy_watchlist_insert_own ON psychology_watchlist
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY psy_watchlist_update_own ON psychology_watchlist
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY psy_watchlist_delete_own ON psychology_watchlist
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS psy_settings_select_own ON psychology_settings;
DROP POLICY IF EXISTS psy_settings_upsert_own ON psychology_settings;

CREATE POLICY psy_settings_select_own ON psychology_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY psy_settings_upsert_own ON psychology_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS psy_analyses_select_own ON psychology_analyses;

CREATE POLICY psy_analyses_select_own ON psychology_analyses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- INSERT는 service_role만 (별도 정책 없음)
