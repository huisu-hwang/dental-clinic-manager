-- ============================================
-- 리콜 제외 기능 추가 마이그레이션
-- Migration: 20260208_add_recall_exclusion.sql
-- Created: 2026-02-08
--
-- 목적: 친인척/가족, 비우호적 환자를 리콜 대상에서 제외
-- 변경: recall_patients 테이블에 exclude_reason 컬럼 추가
-- ============================================

-- 1. recall_patients 테이블에 exclude_reason 컬럼 추가
-- 값: NULL (일반 환자), 'family' (친인척/가족), 'unfavorable' (비우호적 환자)
ALTER TABLE recall_patients
ADD COLUMN IF NOT EXISTS exclude_reason VARCHAR(20) DEFAULT NULL;

-- 2. 제외 사유 컬럼 코멘트
COMMENT ON COLUMN recall_patients.exclude_reason IS '리콜 제외 사유: NULL=일반, family=친인척/가족, unfavorable=비우호적 환자';

-- 3. 인덱스 추가 (제외 환자 필터링 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_recall_patients_exclude_reason
ON recall_patients(exclude_reason)
WHERE exclude_reason IS NOT NULL;

-- ============================================
-- Migration Complete
-- ============================================
