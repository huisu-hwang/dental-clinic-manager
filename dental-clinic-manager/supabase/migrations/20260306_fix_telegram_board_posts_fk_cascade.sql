-- ============================================
-- telegram_board_posts FK CASCADE 수정
-- Migration: 20260306_fix_telegram_board_posts_fk_cascade.sql
-- Created: 2026-03-06
--
-- 문제: telegram_board_posts.created_by FK에 ON DELETE CASCADE가 없어
--       사용자 삭제 시 FK 위반 에러 발생
-- 해결: FK를 ON DELETE CASCADE로 재생성
-- ============================================

-- 1. telegram_board_posts.created_by FK를 CASCADE로 변경
ALTER TABLE IF EXISTS telegram_board_posts
  DROP CONSTRAINT IF EXISTS telegram_board_posts_created_by_fkey;

ALTER TABLE IF EXISTS telegram_board_posts
  ADD CONSTRAINT telegram_board_posts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- 2. community_reports.reviewed_by FK를 SET NULL로 변경
-- (리뷰어가 삭제되어도 신고 기록은 유지)
ALTER TABLE IF EXISTS community_reports
  DROP CONSTRAINT IF EXISTS community_reports_reviewed_by_fkey;

ALTER TABLE IF EXISTS community_reports
  ADD CONSTRAINT community_reports_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. community_penalties.issued_by FK를 SET NULL로 변경
-- (관리자가 삭제되어도 제재 기록은 유지)
ALTER TABLE IF EXISTS community_penalties
  DROP CONSTRAINT IF EXISTS community_penalties_issued_by_fkey;

-- issued_by가 NOT NULL이면 SET NULL이 불가하므로 NULL 허용으로 변경
ALTER TABLE IF EXISTS community_penalties
  ALTER COLUMN issued_by DROP NOT NULL;

ALTER TABLE IF EXISTS community_penalties
  ADD CONSTRAINT community_penalties_issued_by_fkey
  FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================
-- Migration Complete
-- ============================================
