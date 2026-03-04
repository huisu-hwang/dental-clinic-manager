-- ============================================
-- 게시판 생성자 삭제 권한 추가
-- Migration: 20260304_add_group_creator_delete_policy.sql
-- Created: 2026-03-04
--
-- 변경: telegram_board_posts DELETE 정책에 게시판 생성자(telegram_groups.created_by) 권한 추가
-- ============================================

-- 기존 DELETE 정책 교체: 게시판 생성자도 삭제 가능하도록
DROP POLICY IF EXISTS "telegram_board_posts_delete" ON telegram_board_posts;

CREATE POLICY "telegram_board_posts_delete" ON telegram_board_posts
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR EXISTS (
      SELECT 1 FROM telegram_groups
      WHERE telegram_groups.id = telegram_board_posts.telegram_group_id
        AND telegram_groups.created_by = auth.uid()
    )
  );
