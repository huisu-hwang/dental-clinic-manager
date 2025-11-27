-- QR 코드 유효 기간 설정 기능 추가
-- 사용자가 QR 코드 생성 주기를 임의로 변경할 수 있도록 지원

-- attendance_qr_codes 테이블에 유효 기간 관련 컬럼 추가
ALTER TABLE attendance_qr_codes
ADD COLUMN IF NOT EXISTS valid_until DATE,
ADD COLUMN IF NOT EXISTS validity_type TEXT DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 1;

-- valid_until이 NULL인 기존 레코드는 valid_date와 동일하게 설정
UPDATE attendance_qr_codes
SET valid_until = valid_date
WHERE valid_until IS NULL;

-- 인덱스 추가 (유효 기간 범위 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_valid_until
ON attendance_qr_codes(valid_until);

CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_validity_range
ON attendance_qr_codes(valid_date, valid_until);

-- 코멘트 추가
COMMENT ON COLUMN attendance_qr_codes.valid_until IS 'QR 코드 유효 종료 날짜 (YYYY-MM-DD)';
COMMENT ON COLUMN attendance_qr_codes.validity_type IS 'QR 코드 유효 기간 타입 (daily, weekly, monthly, custom)';
COMMENT ON COLUMN attendance_qr_codes.validity_days IS 'QR 코드 유효 기간 (일 수)';
