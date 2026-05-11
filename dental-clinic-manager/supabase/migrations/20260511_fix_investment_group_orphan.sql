-- ============================================
-- 소모임 보정 — "치과 경영 스터디 - 투자" (slug: investment) 그룹의
-- 1) created_by=NULL orphan 상태 해소 (운영자 = whitedc0902)
-- 2) visibility 를 'private' → 'public_list' 로 전환하여 공개 소모임 섹션에 노출
--
-- 배경: 해당 그룹은 created_by 가 NULL 이고 멤버 0명이라 어떤 사용자에게도
-- 보이지 않는 완전 고립 상태였음. 운영자도 없어 UI 에서 visibility 변경 불가.
-- 다른 두 모임의 운영자 패턴(whitedc0902)에 맞춰 owner 지정 후 공개 전환.
--
-- Migration: 20260511_fix_investment_group_orphan.sql
-- Created: 2026-05-11
-- ============================================

UPDATE telegram_groups
SET
  created_by = COALESCE(created_by, 'eb46c51d-95a1-4be9-9b30-edcdbd9eb8be'),  -- whitedc0902 (황희수)
  visibility = 'public_list',
  updated_at = now()
WHERE id = '23fea988-21da-4500-a77a-ba0ff9f7e66c'
  AND (visibility = 'private' OR created_by IS NULL);
