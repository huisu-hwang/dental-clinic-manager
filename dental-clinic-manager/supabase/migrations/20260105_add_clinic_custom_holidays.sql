-- ============================================
-- 병원 추가 법정 공휴일 테이블
-- Migration: 20260105_add_clinic_custom_holidays.sql
-- Created: 2026-01-05
--
-- 기능:
-- - 병원에서 추가로 지정한 법정 공휴일 관리
-- - 임시 공휴일, 선거일 등 특별 공휴일 추가 가능
-- ============================================

-- ============================================
-- 1. 병원 추가 법정 공휴일 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS clinic_custom_public_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- 공휴일 정보
  holiday_date DATE NOT NULL,              -- 공휴일 날짜
  holiday_name VARCHAR(100) NOT NULL,      -- 공휴일 이름 (예: 대통령 선거일)
  description TEXT,                        -- 설명 (선택)

  -- 생성/수정 정보
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- 같은 병원에서 같은 날짜는 중복 불가
  CONSTRAINT unique_clinic_custom_holiday UNIQUE (clinic_id, holiday_date)
);

-- 성능 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_clinic_custom_holidays_clinic ON clinic_custom_public_holidays(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_custom_holidays_date ON clinic_custom_public_holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_clinic_custom_holidays_clinic_date ON clinic_custom_public_holidays(clinic_id, holiday_date);

-- ============================================
-- 2. RLS (Row Level Security) 정책
-- ============================================
ALTER TABLE clinic_custom_public_holidays ENABLE ROW LEVEL SECURITY;

-- 같은 병원 사용자는 조회 가능
DROP POLICY IF EXISTS "Users can view own clinic custom holidays" ON clinic_custom_public_holidays;
CREATE POLICY "Users can view own clinic custom holidays" ON clinic_custom_public_holidays
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- Owner만 추가/수정/삭제 가능
DROP POLICY IF EXISTS "Owners can manage custom holidays" ON clinic_custom_public_holidays;
CREATE POLICY "Owners can manage custom holidays" ON clinic_custom_public_holidays
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- ============================================
-- 3. 코멘트 추가
-- ============================================
COMMENT ON TABLE clinic_custom_public_holidays IS '병원별 추가 법정 공휴일 (선거일, 임시공휴일 등)';
COMMENT ON COLUMN clinic_custom_public_holidays.holiday_date IS '공휴일 날짜';
COMMENT ON COLUMN clinic_custom_public_holidays.holiday_name IS '공휴일 이름';
COMMENT ON COLUMN clinic_custom_public_holidays.description IS '공휴일 설명 (선택)';

-- ============================================
-- Migration Complete
-- ============================================
