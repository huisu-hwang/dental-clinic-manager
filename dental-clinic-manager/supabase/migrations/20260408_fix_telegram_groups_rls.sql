-- ============================================
-- telegram_groups RLS 정책 수정
-- USING(true)를 멤버/관리자 기반으로 제한
-- Migration: 20260408_fix_telegram_groups_rls.sql
-- Created: 2026-04-08
-- ============================================

-- 기존 과도하게 허용된 정책 삭제
DROP POLICY IF EXISTS "telegram_groups_select" ON telegram_groups;

-- 새 정책: 그룹 멤버이거나 master_admin만 조회 가능
CREATE POLICY "telegram_groups_select" ON telegram_groups
  FOR SELECT TO authenticated
  USING (
    -- master_admin은 모든 그룹 조회 가능
    auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
    OR
    -- 그룹 멤버만 해당 그룹 조회 가능
    id IN (
      SELECT telegram_group_id FROM telegram_group_members
      WHERE user_id = auth.uid()
    )
    OR
    -- 그룹 생성자도 조회 가능
    created_by = auth.uid()
  );
