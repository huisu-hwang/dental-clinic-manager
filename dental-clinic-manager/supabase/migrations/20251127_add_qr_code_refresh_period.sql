-- ============================================
-- QR 코드 갱신 주기 기능 추가
-- Migration: 20251127_add_qr_code_refresh_period.sql
-- Created: 2025-11-27
-- ============================================

-- 1. refresh_period 컬럼 추가 (갱신 주기)
ALTER TABLE attendance_qr_codes
ADD COLUMN IF NOT EXISTS refresh_period VARCHAR(20) DEFAULT 'daily'
CHECK (refresh_period IN ('daily', 'weekly', 'monthly', 'yearly'));

-- 2. valid_until 컬럼 추가 (유효 종료일)
ALTER TABLE attendance_qr_codes
ADD COLUMN IF NOT EXISTS valid_until DATE;

-- 3. 기존 데이터 업데이트 (valid_until = valid_date + refresh_period)
UPDATE attendance_qr_codes
SET valid_until = valid_date
WHERE valid_until IS NULL;

-- 4. valid_until에 NOT NULL 제약 추가
ALTER TABLE attendance_qr_codes
ALTER COLUMN valid_until SET NOT NULL;

-- 5. valid_until 기본값 설정 (refresh_period에 따라 동적으로 설정)
ALTER TABLE attendance_qr_codes
ALTER COLUMN valid_until SET DEFAULT CURRENT_DATE;

-- 6. 유효 날짜 범위 검증 제약 추가
ALTER TABLE attendance_qr_codes
ADD CONSTRAINT valid_date_range CHECK (valid_until >= valid_date);

-- 7. 인덱스 추가 (유효 기간 기반 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_attendance_qr_valid_until ON attendance_qr_codes(valid_until);
CREATE INDEX IF NOT EXISTS idx_attendance_qr_refresh_period ON attendance_qr_codes(refresh_period);

-- 8. valid_date와 valid_until을 모두 사용하는 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_attendance_qr_date_range ON attendance_qr_codes(valid_date, valid_until)
WHERE is_active = true;

-- 9. 기존 unique index 삭제 (valid_date 기반)
DROP INDEX IF EXISTS idx_attendance_qr_clinic_date;

-- 10. 새로운 unique index 생성 (clinic_id, branch_id, valid_date 기반)
CREATE UNIQUE INDEX idx_attendance_qr_clinic_branch_date ON attendance_qr_codes(clinic_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), valid_date)
WHERE is_active = true;

-- 11. 컬럼 코멘트 추가
COMMENT ON COLUMN attendance_qr_codes.refresh_period IS '갱신 주기: daily(매일), weekly(매주), monthly(매월), yearly(매년)';
COMMENT ON COLUMN attendance_qr_codes.valid_until IS 'QR 코드 유효 종료일 (YYYY-MM-DD 형식)';

-- ============================================
-- Migration Complete
-- ============================================
