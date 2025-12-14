-- ============================================
-- Migration: 직급별 실장 결재 설정 지원
-- require_manager_approval 컬럼을 boolean에서 JSONB로 변경
-- 기존 boolean 값은 직급별 객체로 마이그레이션
-- ============================================

-- 1. 기존 컬럼 이름 변경 (백업용)
ALTER TABLE leave_policies
RENAME COLUMN require_manager_approval TO require_manager_approval_old;

-- 2. 새로운 JSONB 컬럼 추가
ALTER TABLE leave_policies
ADD COLUMN require_manager_approval JSONB;

-- 3. 기존 boolean 값을 새로운 JSONB 형식으로 마이그레이션
UPDATE leave_policies
SET require_manager_approval = jsonb_build_object(
  'team_leader', COALESCE(require_manager_approval_old, true),
  'staff', COALESCE(require_manager_approval_old, true)
);

-- 4. 기본값 설정
ALTER TABLE leave_policies
ALTER COLUMN require_manager_approval SET DEFAULT '{"team_leader": true, "staff": true}'::jsonb;

-- 5. 이전 컬럼 삭제
ALTER TABLE leave_policies
DROP COLUMN require_manager_approval_old;

-- 6. 컬럼 코멘트 업데이트
COMMENT ON COLUMN leave_policies.require_manager_approval IS
  '직급별 실장 결재 포함 여부 (JSONB: {"team_leader": boolean, "staff": boolean})';
