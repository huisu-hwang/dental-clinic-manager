-- ============================================
-- hometax_credentials 테이블 누락 컬럼 추가
-- Migration: 20260322_add_missing_columns_to_hometax_credentials.sql
-- Created: 2026-03-22
--
-- 원본 마이그레이션에서 누락된 컬럼 추가:
-- - last_login_attempt: 마지막 로그인 시도 시각
-- - login_fail_count: 로그인 실패 횟수
-- ============================================

ALTER TABLE hometax_credentials
ADD COLUMN IF NOT EXISTS last_login_attempt TIMESTAMPTZ;

ALTER TABLE hometax_credentials
ADD COLUMN IF NOT EXISTS login_fail_count INTEGER DEFAULT 0;

COMMENT ON COLUMN hometax_credentials.last_login_attempt IS '마지막 로그인 시도 시각';
COMMENT ON COLUMN hometax_credentials.login_fail_count IS '연속 로그인 실패 횟수';
