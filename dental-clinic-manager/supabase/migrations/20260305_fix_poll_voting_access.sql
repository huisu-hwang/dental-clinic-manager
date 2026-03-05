-- ============================================
-- 투표 접근 권한 수정
-- Migration: 20260305_fix_poll_voting_access.sql
-- Created: 2026-03-05
--
-- 문제: 소모임 멤버가 투표에 참가할 수 없음
-- 원인: telegram_group_members SELECT RLS가 본인 레코드만 허용
-- 수정: 같은 그룹 멤버끼리 서로 조회 가능하도록 정책 추가
-- ============================================

-- 같은 그룹 멤버가 서로 조회 가능하도록 SELECT 정책 추가
CREATE POLICY "telegram_members_select_group_member" ON telegram_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telegram_group_members AS my_membership
      WHERE my_membership.telegram_group_id = telegram_group_members.telegram_group_id
        AND my_membership.user_id = auth.uid()
    )
  );
