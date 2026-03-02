-- ============================================
-- 텔레그램 게시판 신청/승인 프로세스
-- Migration: 20260302_add_telegram_board_application_flow.sql
-- Created: 2026-03-02
--
-- telegram_groups 테이블에 신청/승인 관련 컬럼 추가
-- 기존 그룹은 DEFAULT 'approved'로 영향 없음
-- ============================================

-- 1. 컬럼 추가
ALTER TABLE telegram_groups
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS application_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID DEFAULT NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL;

-- 2. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_telegram_groups_status ON telegram_groups(status);

-- 3. RLS 정책 업데이트: 인증된 사용자가 pending 상태로 INSERT 가능하도록 변경
DROP POLICY IF EXISTS "telegram_groups_insert" ON telegram_groups;

CREATE POLICY "telegram_groups_insert" ON telegram_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    -- master_admin은 어떤 상태로든 생성 가능
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR (
      -- 일반 사용자는 pending 상태로만 신청 가능, created_by는 본인이어야 함
      status = 'pending' AND created_by = auth.uid()
    )
  );

-- ============================================
-- Migration Complete
-- ============================================
