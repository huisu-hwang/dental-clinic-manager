-- =====================================================
-- telegram_group_members INSERT RLS 정책 수정
-- 문제: 그룹 생성자가 다른 회원을 초대할 때 RLS 위반
-- 원인: INSERT 정책이 master_admin 또는 자기 자신만 허용
-- 해결: 그룹 생성자도 멤버 추가 가능하도록 정책 확장
-- =====================================================

-- 기존 INSERT 정책 삭제
DROP POLICY IF EXISTS "telegram_members_insert_admin" ON telegram_group_members;

-- 새 INSERT 정책: master_admin, 그룹 생성자, 자기 자신 가입 허용
CREATE POLICY "telegram_members_insert_allowed" ON telegram_group_members
FOR INSERT WITH CHECK (
  -- master_admin은 모든 그룹에 멤버 추가 가능
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'master_admin'
  )
  -- 그룹 생성자는 멤버 추가 가능
  OR EXISTS (
    SELECT 1 FROM telegram_groups
    WHERE id = telegram_group_id AND created_by = auth.uid()
  )
  -- 자기 자신을 멤버로 추가 (초대 링크 가입 등)
  OR user_id = auth.uid()
);
