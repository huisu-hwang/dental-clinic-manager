-- ============================================
-- hometax_credentials 테이블에 주민등록번호 컬럼 추가
-- Migration: 20260322_add_resident_number_to_hometax_credentials.sql
-- Created: 2026-03-22
--
-- 홈택스 ID/PW 로그인 시 주민등록번호 생년월일 6자리 + 뒷자리 1자리 (총 7자리) 필요
-- AES-256-GCM으로 암호화하여 저장
-- ============================================

ALTER TABLE hometax_credentials
ADD COLUMN IF NOT EXISTS encrypted_resident_number TEXT;

COMMENT ON COLUMN hometax_credentials.encrypted_resident_number IS '주민등록번호 앞 7자리 (생년월일6+뒷첫자리1), AES-256-GCM 암호화';
