-- ============================================
-- 텔레그램 게시판 좋아요/스크랩 기능 추가
-- Migration: 20260303_add_telegram_board_like_scrap.sql
-- Created: 2026-03-03
-- ============================================

-- telegram_board_posts 컬럼 추가
ALTER TABLE telegram_board_posts
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_count INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- telegram_board_likes 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_board_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES telegram_board_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_board_likes_unique UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_board_likes_user ON telegram_board_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_likes_post ON telegram_board_likes(post_id);

-- ============================================
-- telegram_board_scraps 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_board_scraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES telegram_board_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_board_scraps_unique UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_board_scraps_user ON telegram_board_scraps(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_board_scraps_post ON telegram_board_scraps(post_id);

-- ============================================
-- RLS 정책
-- ============================================
ALTER TABLE telegram_board_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_board_scraps ENABLE ROW LEVEL SECURITY;

-- telegram_board_likes RLS
CREATE POLICY "telegram_board_likes_select" ON telegram_board_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_board_likes_insert" ON telegram_board_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "telegram_board_likes_delete" ON telegram_board_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- telegram_board_scraps RLS
CREATE POLICY "telegram_board_scraps_select" ON telegram_board_scraps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_board_scraps_insert" ON telegram_board_scraps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "telegram_board_scraps_delete" ON telegram_board_scraps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- RPC: 좋아요 토글 (atomic)
-- ============================================
CREATE OR REPLACE FUNCTION toggle_telegram_board_like(p_user_id UUID, p_post_id UUID)
RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM telegram_board_likes WHERE user_id = p_user_id AND post_id = p_post_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM telegram_board_likes WHERE user_id = p_user_id AND post_id = p_post_id;
    UPDATE telegram_board_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = p_post_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', false, 'like_count', v_new_count);
  ELSE
    INSERT INTO telegram_board_likes (user_id, post_id) VALUES (p_user_id, p_post_id);
    UPDATE telegram_board_posts SET like_count = like_count + 1 WHERE id = p_post_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', true, 'like_count', v_new_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: 스크랩 토글 (atomic)
-- ============================================
CREATE OR REPLACE FUNCTION toggle_telegram_board_scrap(p_user_id UUID, p_post_id UUID)
RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM telegram_board_scraps WHERE user_id = p_user_id AND post_id = p_post_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM telegram_board_scraps WHERE user_id = p_user_id AND post_id = p_post_id;
    UPDATE telegram_board_posts SET scrap_count = GREATEST(0, scrap_count - 1) WHERE id = p_post_id
      RETURNING scrap_count INTO v_new_count;
    RETURN json_build_object('scraped', false, 'scrap_count', v_new_count);
  ELSE
    INSERT INTO telegram_board_scraps (user_id, post_id) VALUES (p_user_id, p_post_id);
    UPDATE telegram_board_posts SET scrap_count = scrap_count + 1 WHERE id = p_post_id
      RETURNING scrap_count INTO v_new_count;
    RETURN json_build_object('scraped', true, 'scrap_count', v_new_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Migration Complete
-- ============================================
