-- ============================================
-- QR 코드 위치 검증 모드 설정 추가
-- Migration: 20260127_add_qr_location_verification_mode.sql
-- Created: 2026-01-27
-- ============================================

-- clinics 테이블에 QR 코드 위치 검증 모드 컬럼 추가
-- 'required': 위치 확인 필수 (기본값, 기존 동작)
-- 'optional': 위치 확인 없이 QR 코드만으로 인증 가능
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS qr_location_verification_mode VARCHAR(20) DEFAULT 'required'
CHECK (qr_location_verification_mode IN ('required', 'optional'));

-- 컬럼 코멘트 추가
COMMENT ON COLUMN clinics.qr_location_verification_mode IS
  'QR 코드 출퇴근 인증 시 위치 검증 모드: required=위치 확인 필수, optional=위치 확인 없이 인증 가능';

-- 기존 데이터에 기본값 적용 (NULL인 경우)
UPDATE clinics
SET qr_location_verification_mode = 'required'
WHERE qr_location_verification_mode IS NULL;

-- ============================================
-- Migration Complete
-- ============================================
