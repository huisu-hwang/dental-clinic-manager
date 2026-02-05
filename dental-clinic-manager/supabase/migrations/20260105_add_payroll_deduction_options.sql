-- ============================================
-- 급여 설정에 근태 차감/수당 옵션 추가
-- Migration: 20260105_add_payroll_deduction_options.sql
-- Created: 2026-01-05
--
-- 기능:
-- - 지각 차감 여부 설정
-- - 조퇴 차감 여부 설정
-- - 초과근무 수당 포함 여부 설정
-- ============================================

-- ============================================
-- 1. 기존 테이블에 컬럼 추가
-- ============================================

-- 지각 시간 급여 차감 여부 (기본: true - 차감함)
ALTER TABLE employee_salary_settings
ADD COLUMN IF NOT EXISTS deduct_late_minutes BOOLEAN DEFAULT true;

-- 조퇴 시간 급여 차감 여부 (기본: true - 차감함)
ALTER TABLE employee_salary_settings
ADD COLUMN IF NOT EXISTS deduct_early_leave_minutes BOOLEAN DEFAULT true;

-- 초과근무 수당 포함 여부 (기본: true - 포함함)
ALTER TABLE employee_salary_settings
ADD COLUMN IF NOT EXISTS include_overtime_pay BOOLEAN DEFAULT true;

-- ============================================
-- 2. 코멘트 추가
-- ============================================
COMMENT ON COLUMN employee_salary_settings.deduct_late_minutes IS '지각 시간 급여 차감 여부';
COMMENT ON COLUMN employee_salary_settings.deduct_early_leave_minutes IS '조퇴 시간 급여 차감 여부';
COMMENT ON COLUMN employee_salary_settings.include_overtime_pay IS '초과근무 수당 포함 여부';

-- ============================================
-- Migration Complete
-- ============================================
