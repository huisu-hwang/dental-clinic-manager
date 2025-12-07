-- ============================================
-- 연차 정책에 실장 결재 포함 여부 설정 추가
-- Migration: 20251207_add_require_manager_approval.sql
-- Created: 2025-12-07
-- ============================================

-- leave_policies 테이블에 require_manager_approval 컬럼 추가
-- 기본값 true: 실장 결재를 포함 (기존 동작 유지)
ALTER TABLE leave_policies
ADD COLUMN IF NOT EXISTS require_manager_approval BOOLEAN DEFAULT true;

-- 컬럼 설명 추가
COMMENT ON COLUMN leave_policies.require_manager_approval IS '실장 결재 포함 여부 (true: 직원/팀장 → 실장 → 원장, false: 직원/팀장 → 원장 직접)';
