-- ============================================
-- 투자 모듈 즐겨찾기 종목 (사용자별)
-- - investment_favorites: 사용자가 즐겨찾기한 종목 ((user_id, ticker, market) UNIQUE)
-- Migration: 20260506_investment_favorites.sql
-- Created: 2026-05-06
-- ============================================

CREATE TABLE IF NOT EXISTS investment_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      VARCHAR(20) NOT NULL,
  market      VARCHAR(2)  NOT NULL CHECK (market IN ('KR','US')),
  ticker_name TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker, market)
);

CREATE INDEX IF NOT EXISTS idx_inv_fav_user
  ON investment_favorites (user_id, sort_order DESC, created_at DESC);

ALTER TABLE investment_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_fav_select_own" ON investment_favorites;
CREATE POLICY "inv_fav_select_own" ON investment_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_insert_own" ON investment_favorites;
CREATE POLICY "inv_fav_insert_own" ON investment_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_update_own" ON investment_favorites;
CREATE POLICY "inv_fav_update_own" ON investment_favorites
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_delete_own" ON investment_favorites;
CREATE POLICY "inv_fav_delete_own" ON investment_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
