-- ============================================
-- 오버타임 식사 기록 테이블 리팩토링
-- 직원별 기록 → 클리닉/날짜별 공통 기록으로 변경
-- Migration: refactor_overtime_meal_logs_to_clinic_common
-- Created: 2026-03-11
--
-- 변경사항:
-- 1. user_id, user_name 컬럼 제거 (전 직원 공통 적용)
-- 2. has_lunch_overtime → has_lunch, has_dinner_overtime → has_dinner
-- 3. has_extra_overtime → has_overtime + overtime_minutes 추가
-- 4. UNIQUE(clinic_id, date) 제약조건 추가
-- ============================================

-- 기존 테이블 삭제
DROP TABLE IF EXISTS overtime_meal_logs;

-- 새 스키마로 재생성
CREATE TABLE overtime_meal_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  date DATE NOT NULL,
  has_lunch BOOLEAN NOT NULL DEFAULT false,
  has_dinner BOOLEAN NOT NULL DEFAULT false,
  has_overtime BOOLEAN NOT NULL DEFAULT false,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, date)
);

-- RLS 활성화
ALTER TABLE overtime_meal_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Users can view their clinic overtime meal logs"
  ON overtime_meal_logs FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert overtime meal logs for their clinic"
  ON overtime_meal_logs FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their clinic overtime meal logs"
  ON overtime_meal_logs FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their clinic overtime meal logs"
  ON overtime_meal_logs FOR DELETE
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- 인덱스
CREATE INDEX idx_overtime_meal_logs_clinic_date ON overtime_meal_logs(clinic_id, date);
