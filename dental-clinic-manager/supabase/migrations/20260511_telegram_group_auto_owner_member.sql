-- ============================================
-- 소모임 모임장 자동 멤버 등록 + 기존 데이터 backfill
--
-- 배경: telegram_group_members 에 모임장(created_by) 이 자동 등록되지 않아,
-- 신규 그룹이나 owner 가 누락된 그룹에서 모임장이 자기 모임에 진입할 때
-- 비멤버 화면(가입 신청 요구)으로 노출되는 문제 발생.
--
-- 조치 1) 신규 그룹 INSERT 시 owner 를 'admin' 멤버로 자동 upsert
-- 조치 2) 기존 그룹 중 owner 가 멤버 테이블에 없는 케이스 일괄 backfill
--
-- Migration: 20260511_telegram_group_auto_owner_member.sql
-- Created: 2026-05-11
-- ============================================

CREATE OR REPLACE FUNCTION auto_add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO telegram_group_members (telegram_group_id, user_id, role, joined_via)
    VALUES (NEW.id, NEW.created_by, 'admin', 'admin')
    ON CONFLICT (telegram_group_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_add_owner_member ON telegram_groups;
CREATE TRIGGER trg_auto_add_owner_member
  AFTER INSERT ON telegram_groups
  FOR EACH ROW EXECUTE FUNCTION auto_add_owner_as_member();

-- 기존 그룹들 backfill — owner 가 멤버에 없으면 admin 으로 등록
INSERT INTO telegram_group_members (telegram_group_id, user_id, role, joined_via)
SELECT g.id, g.created_by, 'admin', 'admin'
FROM telegram_groups g
WHERE g.created_by IS NOT NULL
ON CONFLICT (telegram_group_id, user_id) DO NOTHING;

COMMENT ON FUNCTION auto_add_owner_as_member IS
  'telegram_groups INSERT 시 created_by(모임장)를 자동으로 telegram_group_members 에 admin 멤버로 등록';
