-- ============================================
-- 병원 공휴일 설정 테이블
-- Migration: 20260105_add_clinic_holiday_settings.sql
-- Created: 2026-01-05
--
-- 기능:
-- - 법정 공휴일 휴무 적용 여부
-- - 대체 공휴일 휴무 적용 및 연차 차감 여부
-- - 병원 지정 휴무일 연차 차감 여부
-- ============================================

-- ============================================
-- 1. 병원 공휴일 설정 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS clinic_holiday_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- 법정 공휴일 설정
  use_public_holidays BOOLEAN DEFAULT true,      -- 법정 공휴일 휴무 적용
  deduct_public_holidays BOOLEAN DEFAULT false,  -- 법정 공휴일에 연차 차감 (보통 false)

  -- 대체 공휴일 설정
  use_substitute_holidays BOOLEAN DEFAULT true,      -- 대체 공휴일 휴무 적용
  deduct_substitute_holidays BOOLEAN DEFAULT false,  -- 대체 공휴일에 연차 차감

  -- 병원 지정 휴무일 설정
  deduct_clinic_holidays BOOLEAN DEFAULT true,  -- 병원 지정 휴무일에 연차 차감

  -- 생성/수정 정보
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 병원당 하나의 설정만 존재
  CONSTRAINT unique_clinic_holiday_settings UNIQUE (clinic_id)
);

-- 성능 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_clinic_holiday_settings_clinic ON clinic_holiday_settings(clinic_id);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_clinic_holiday_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clinic_holiday_settings_updated_at ON clinic_holiday_settings;
CREATE TRIGGER trigger_clinic_holiday_settings_updated_at
  BEFORE UPDATE ON clinic_holiday_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_holiday_settings_updated_at();

-- ============================================
-- 2. RLS (Row Level Security) 정책
-- ============================================
ALTER TABLE clinic_holiday_settings ENABLE ROW LEVEL SECURITY;

-- 같은 병원 사용자는 조회 가능
DROP POLICY IF EXISTS "Users can view own clinic holiday settings" ON clinic_holiday_settings;
CREATE POLICY "Users can view own clinic holiday settings" ON clinic_holiday_settings
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- Owner만 수정 가능
DROP POLICY IF EXISTS "Owners can manage holiday settings" ON clinic_holiday_settings;
CREATE POLICY "Owners can manage holiday settings" ON clinic_holiday_settings
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- ============================================
-- 3. 코멘트 추가
-- ============================================
COMMENT ON TABLE clinic_holiday_settings IS '병원별 공휴일 정책 설정';
COMMENT ON COLUMN clinic_holiday_settings.use_public_holidays IS '법정 공휴일 휴무 적용 여부';
COMMENT ON COLUMN clinic_holiday_settings.deduct_public_holidays IS '법정 공휴일에 연차 차감 여부 (보통 false)';
COMMENT ON COLUMN clinic_holiday_settings.use_substitute_holidays IS '대체 공휴일 휴무 적용 여부';
COMMENT ON COLUMN clinic_holiday_settings.deduct_substitute_holidays IS '대체 공휴일에 연차 차감 여부';
COMMENT ON COLUMN clinic_holiday_settings.deduct_clinic_holidays IS '병원 지정 휴무일에 연차 차감 여부';

-- ============================================
-- Migration Complete
-- ============================================
