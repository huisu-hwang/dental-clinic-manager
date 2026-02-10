-- ============================================
-- CODEF 테이블 업데이트: 암호화 비밀번호 + 매출/매입 구분 로그
-- Migration: 20260209_update_codef_tables.sql
-- Created: 2026-02-09
-- ============================================

-- 1. codef_connections 테이블에 encrypted_password 컬럼 추가
ALTER TABLE codef_connections
  ADD COLUMN IF NOT EXISTS encrypted_password TEXT;

COMMENT ON COLUMN codef_connections.encrypted_password IS 'AES-256-GCM 암호화된 홈택스 비밀번호 (sync 시 복호화하여 CODEF API 직접 인증에 사용)';

-- 2. codef_sync_logs 테이블에 매출/매입 구분 컬럼 추가
ALTER TABLE codef_sync_logs
  ADD COLUMN IF NOT EXISTS tax_invoice_sales_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_invoice_purchase_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_receipt_sales_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_receipt_purchase_count INTEGER DEFAULT 0;

-- 기존 데이터 마이그레이션: 이전 컬럼 값을 새 컬럼으로 복사
UPDATE codef_sync_logs
SET
  tax_invoice_purchase_count = COALESCE(tax_invoice_count, 0),
  cash_receipt_purchase_count = COALESCE(cash_receipt_count, 0)
WHERE tax_invoice_purchase_count = 0
  AND (tax_invoice_count > 0 OR cash_receipt_count > 0);

-- ============================================
-- Migration Complete
-- ============================================
