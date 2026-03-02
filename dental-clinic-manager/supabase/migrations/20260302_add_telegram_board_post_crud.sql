-- ============================================
-- 텔레그램 게시판 CRUD + 댓글 기능 추가
-- Migration: 20260302_add_telegram_board_post_crud.sql
-- Created: 2026-03-02
--
-- 1. telegram_board_posts에 created_by, comment_count 컬럼 추가
-- 2. telegram_board_comments 테이블 생성
-- 3. RLS 정책 추가
-- 4. 댓글 수 동기화 트리거
-- ============================================

-- 1. telegram_board_posts 컬럼 추가
ALTER TABLE telegram_board_posts
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

-- post_type에 'general' 값도 허용되도록 (CHECK 제약이 있다면 제거)
-- 기존 CHECK 제약 조건이 있을 수 있으므로 안전하게 처리
DO $$
BEGIN
  -- 기존 post_type CHECK 제약 제거 시도
  ALTER TABLE telegram_board_posts DROP CONSTRAINT IF EXISTS telegram_board_posts_post_type_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. telegram_board_comments 테이블 생성
CREATE TABLE IF NOT EXISTS telegram_board_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES telegram_board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_telegram_board_comments_post_id ON telegram_board_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_comments_user_id ON telegram_board_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_posts_created_by ON telegram_board_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_telegram_board_posts_post_type ON telegram_board_posts(post_type);

-- 3. RLS 정책

-- telegram_board_posts: INSERT 정책 (인증된 사용자)
ALTER TABLE telegram_board_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_board_posts_select" ON telegram_board_posts;
CREATE POLICY "telegram_board_posts_select" ON telegram_board_posts
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "telegram_board_posts_insert" ON telegram_board_posts;
CREATE POLICY "telegram_board_posts_insert" ON telegram_board_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    -- general 타입: 인증된 사용자가 직접 작성
    (post_type = 'general' AND created_by = auth.uid())
    OR
    -- 기타 타입(summary, file, link): master_admin만 생성 가능
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

DROP POLICY IF EXISTS "telegram_board_posts_update" ON telegram_board_posts;
CREATE POLICY "telegram_board_posts_update" ON telegram_board_posts
  FOR UPDATE TO authenticated
  USING (
    -- 작성자 본인 또는 master_admin
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

DROP POLICY IF EXISTS "telegram_board_posts_delete" ON telegram_board_posts;
CREATE POLICY "telegram_board_posts_delete" ON telegram_board_posts
  FOR DELETE TO authenticated
  USING (
    -- 작성자 본인 또는 master_admin
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- telegram_board_comments: RLS 정책
ALTER TABLE telegram_board_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_board_comments_select" ON telegram_board_comments;
CREATE POLICY "telegram_board_comments_select" ON telegram_board_comments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "telegram_board_comments_insert" ON telegram_board_comments;
CREATE POLICY "telegram_board_comments_insert" ON telegram_board_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "telegram_board_comments_update" ON telegram_board_comments;
CREATE POLICY "telegram_board_comments_update" ON telegram_board_comments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

DROP POLICY IF EXISTS "telegram_board_comments_delete" ON telegram_board_comments;
CREATE POLICY "telegram_board_comments_delete" ON telegram_board_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- 4. 댓글 수 동기화 트리거
CREATE OR REPLACE FUNCTION update_telegram_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE telegram_board_posts
    SET comment_count = (
      SELECT COUNT(*) FROM telegram_board_comments WHERE post_id = NEW.post_id
    )
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE telegram_board_posts
    SET comment_count = (
      SELECT COUNT(*) FROM telegram_board_comments WHERE post_id = OLD.post_id
    )
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_telegram_post_comment_count ON telegram_board_comments;
CREATE TRIGGER trigger_update_telegram_post_comment_count
  AFTER INSERT OR DELETE ON telegram_board_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_post_comment_count();

-- ============================================
-- Migration Complete
-- ============================================
