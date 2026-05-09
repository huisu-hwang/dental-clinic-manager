-- ============================================
-- 투자 모듈 — 사용자별 최근 사용 종목 (서버 영속)
-- - investment_recent_tickers: (user_id, ticker, market) UNIQUE, last_used_at 기준 정렬
-- 기존 localStorage 기반(`dcm.recentTickers.v1`)에서 서버 백엔드로 이행하여
-- 디바이스 간 동일하게 유지되도록 함.
-- Migration: 20260509_investment_recent_tickers.sql
-- Created: 2026-05-09
-- ============================================

CREATE TABLE IF NOT EXISTS investment_recent_tickers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        VARCHAR(20) NOT NULL,
  market        VARCHAR(2)  NOT NULL CHECK (market IN ('KR','US')),
  ticker_name   TEXT,
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker, market)
);

CREATE INDEX IF NOT EXISTS idx_inv_recent_user_last_used
  ON investment_recent_tickers (user_id, last_used_at DESC);

ALTER TABLE investment_recent_tickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_recent_select_own" ON investment_recent_tickers;
CREATE POLICY "inv_recent_select_own" ON investment_recent_tickers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_recent_insert_own" ON investment_recent_tickers;
CREATE POLICY "inv_recent_insert_own" ON investment_recent_tickers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_recent_update_own" ON investment_recent_tickers;
CREATE POLICY "inv_recent_update_own" ON investment_recent_tickers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_recent_delete_own" ON investment_recent_tickers;
CREATE POLICY "inv_recent_delete_own" ON investment_recent_tickers
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
