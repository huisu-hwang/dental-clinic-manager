-- ============================================
-- RLS 무한 재귀 오류 수정
-- Migration: 20260306_fix_telegram_members_rls_infinite_recursion.sql
-- Created: 2026-03-06
--
-- 문제: telegram_members_select_group_member 정책이
--       동일 테이블(telegram_group_members)을 자기 자신 안에서
--       참조하여 무한 재귀(42P17 infinite recursion)가 발생
--
-- 해결: SECURITY DEFINER 함수로 RLS 우회하여 재귀 차단
-- ============================================

-- 1. 내가 속한 소모임 ID 목록 반환 (SECURITY DEFINER로 RLS 우회)
CREATE OR REPLACE FUNCTION get_my_telegram_group_ids()
RETURNS SETOF UUID AS $$
  SELECT telegram_group_id
  FROM telegram_group_members
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. 기존 재귀 정책 삭제
DROP POLICY IF EXISTS telegram_members_select_group_member ON telegram_group_members;

-- 3. SECURITY DEFINER 함수를 사용한 새 정책 생성 (재귀 없음)
CREATE POLICY telegram_members_select_group_member
ON telegram_group_members
FOR SELECT
TO authenticated
USING (
  telegram_group_id IN (SELECT get_my_telegram_group_ids())
);
