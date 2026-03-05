-- 기존 RLS 정책 삭제
DROP POLICY IF EXISTS "telegram_invite_links_insert" ON telegram_invite_links;
DROP POLICY IF EXISTS "telegram_invite_links_update" ON telegram_invite_links;
DROP POLICY IF EXISTS "telegram_invite_links_delete" ON telegram_invite_links;

-- INSERT: master_admin 또는 그룹 생성자 또는 그룹 멤버
CREATE POLICY "telegram_invite_links_insert" ON telegram_invite_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR EXISTS (SELECT 1 FROM telegram_groups WHERE telegram_groups.id = telegram_group_id AND telegram_groups.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM telegram_group_members WHERE telegram_group_members.telegram_group_id = telegram_invite_links.telegram_group_id AND telegram_group_members.user_id = auth.uid())
  );

-- UPDATE: master_admin 또는 그룹 생성자 또는 링크 생성자
CREATE POLICY "telegram_invite_links_update" ON telegram_invite_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR EXISTS (SELECT 1 FROM telegram_groups WHERE telegram_groups.id = telegram_group_id AND telegram_groups.created_by = auth.uid())
    OR created_by = auth.uid()
  );

-- DELETE: master_admin 또는 그룹 생성자
CREATE POLICY "telegram_invite_links_delete" ON telegram_invite_links
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR EXISTS (SELECT 1 FROM telegram_groups WHERE telegram_groups.id = telegram_group_id AND telegram_groups.created_by = auth.uid())
  );
