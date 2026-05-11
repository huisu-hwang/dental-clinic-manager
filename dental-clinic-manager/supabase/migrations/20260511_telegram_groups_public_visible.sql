-- ============================================
-- telegram_groups SELECT 정책 확장 — 공개 모임은 인증된 사용자라면 누구나 조회 가능
--
-- 기존(20260408): master_admin / 멤버 / 그룹 생성자만 조회 가능.
-- → 실장(manager) 등 일반 가입 회원이 공개(visibility != 'private') 모임 목록조차
--   가져오지 못해 "공개 소모임" 섹션이 비어 보이는 문제 발생.
--
-- 변경: visibility 가 public_list/public_read/public_full 이고 is_active=true,
--      status='approved' 인 그룹은 인증된 사용자라면 누구나 SELECT 허용.
--      비공개(visibility='private') 그룹은 기존과 동일하게 멤버/owner/master 만.
--      공개 정도는 모임장이 visibility 로 결정하므로 정책은 visibility 만 신뢰.
--
-- Migration: 20260511_telegram_groups_public_visible.sql
-- Created: 2026-05-11
-- ============================================

DROP POLICY IF EXISTS "telegram_groups_select" ON telegram_groups;

CREATE POLICY "telegram_groups_select" ON telegram_groups
  FOR SELECT TO authenticated
  USING (
    -- master_admin: 모든 그룹
    auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
    OR
    -- 그룹 멤버
    id IN (
      SELECT telegram_group_id FROM telegram_group_members
      WHERE user_id = auth.uid()
    )
    OR
    -- 모임장(생성자)
    created_by = auth.uid()
    OR
    -- 공개 모임(목록/열람/열람+댓글)은 모든 인증 사용자가 조회 가능
    (
      is_active = true
      AND status = 'approved'
      AND visibility IN ('public_list', 'public_read', 'public_full')
    )
  );
