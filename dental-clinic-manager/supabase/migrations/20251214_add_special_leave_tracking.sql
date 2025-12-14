-- ============================================
-- 경조사/무급휴가 사용 내역 추적을 위한 컬럼 추가
-- 문제: 경조사(family_event)와 무급휴가(unpaid)는 deduct_from_annual=false이므로
--       기존 used_days, pending_days에 포함되지 않아 연차 현황에 반영되지 않음
-- 해결: 별도 컬럼을 추가하여 사용 내역을 추적
-- ============================================

-- employee_leave_balances 테이블에 경조사/무급휴가 사용 일수 컬럼 추가
ALTER TABLE employee_leave_balances
ADD COLUMN IF NOT EXISTS family_event_days DECIMAL(4,1) DEFAULT 0;

ALTER TABLE employee_leave_balances
ADD COLUMN IF NOT EXISTS unpaid_days DECIMAL(4,1) DEFAULT 0;

-- 컬럼 코멘트 추가
COMMENT ON COLUMN employee_leave_balances.family_event_days IS '경조사 휴가 사용 일수 (연차와 별도 관리)';
COMMENT ON COLUMN employee_leave_balances.unpaid_days IS '무급휴가 사용 일수 (연차와 별도 관리)';
