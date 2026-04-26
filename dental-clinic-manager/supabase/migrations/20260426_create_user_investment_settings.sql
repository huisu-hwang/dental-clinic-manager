-- ============================================
-- 사용자별 자동매매 설정 테이블
-- Migration: 20260426_create_user_investment_settings.sql
-- Created: 2026-04-26
--
-- 목적: 전략 단위가 아닌 사용자(계좌) 단위로 적용되는 안전장치를 저장한다.
--   - 일 최대 손절라인 (daily_loss_limit_*)
--   - 진입가 대비 손절라인 (entry_stop_loss_*)
-- 각 항목은 enabled 토글로 적용 여부를 제어한다.
-- ============================================

CREATE TABLE IF NOT EXISTS user_investment_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_loss_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_loss_limit_percent NUMERIC(5,2) NOT NULL DEFAULT 5.0
    CHECK (daily_loss_limit_percent > 0 AND daily_loss_limit_percent <= 100),
  entry_stop_loss_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  entry_stop_loss_percent NUMERIC(5,2) NOT NULL DEFAULT 3.0
    CHECK (entry_stop_loss_percent > 0 AND entry_stop_loss_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION touch_user_investment_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_investment_settings ON user_investment_settings;
CREATE TRIGGER trg_touch_user_investment_settings
  BEFORE UPDATE ON user_investment_settings
  FOR EACH ROW
  EXECUTE FUNCTION touch_user_investment_settings_updated_at();

-- RLS
ALTER TABLE user_investment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_investment_settings_select_own" ON user_investment_settings;
CREATE POLICY "user_investment_settings_select_own"
  ON user_investment_settings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_investment_settings_insert_own" ON user_investment_settings;
CREATE POLICY "user_investment_settings_insert_own"
  ON user_investment_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_investment_settings_update_own" ON user_investment_settings;
CREATE POLICY "user_investment_settings_update_own"
  ON user_investment_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_investment_settings_delete_own" ON user_investment_settings;
CREATE POLICY "user_investment_settings_delete_own"
  ON user_investment_settings
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_investment_settings IS '사용자별 자동매매 안전장치 설정 (전략 공통 적용)';
COMMENT ON COLUMN user_investment_settings.daily_loss_limit_enabled IS '일 최대 손절라인 적용 여부';
COMMENT ON COLUMN user_investment_settings.daily_loss_limit_percent IS '일 최대 손절라인 (%) - 일일 누적 손실이 이 값을 초과하면 당일 매매 중지';
COMMENT ON COLUMN user_investment_settings.entry_stop_loss_enabled IS '진입가 대비 손절라인 적용 여부';
COMMENT ON COLUMN user_investment_settings.entry_stop_loss_percent IS '진입가 대비 손절라인 (%) - 매입가 대비 이 값만큼 하락하면 자동 매도';
