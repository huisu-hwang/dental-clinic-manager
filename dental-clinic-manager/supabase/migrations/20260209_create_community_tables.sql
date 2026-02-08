-- ============================================
-- 커뮤니티 게시판 테이블 생성
-- Migration: 20260209_create_community_tables.sql
-- Created: 2026-02-09
-- ============================================

-- ============================================
-- 1. community_profiles (닉네임 프로필)
-- ============================================
CREATE TABLE IF NOT EXISTS community_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname VARCHAR(20) NOT NULL,
  avatar_seed VARCHAR(50) DEFAULT NULL,
  bio VARCHAR(200) DEFAULT NULL,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_until TIMESTAMPTZ DEFAULT NULL,
  warning_count INTEGER NOT NULL DEFAULT 0,
  total_posts INTEGER NOT NULL DEFAULT 0,
  total_comments INTEGER NOT NULL DEFAULT 0,
  nickname_changed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_profiles_user_id_unique UNIQUE (user_id),
  CONSTRAINT community_profiles_nickname_unique UNIQUE (nickname),
  CONSTRAINT community_profiles_nickname_length CHECK (char_length(nickname) >= 2 AND char_length(nickname) <= 20)
);

CREATE INDEX idx_community_profiles_user_id ON community_profiles(user_id);
CREATE INDEX idx_community_profiles_nickname ON community_profiles(nickname);

-- ============================================
-- 2. community_posts (게시글)
-- ============================================
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL DEFAULT 'free',
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_blinded BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  has_poll BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_posts_category_check CHECK (category IN ('free', 'advice', 'info', 'humor', 'daily', 'career'))
);

-- 동적 카테고리 지원을 위해 CHECK 제약 제거
-- (community_categories 테이블에서 카테고리를 동적으로 관리)
ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_category_check;

CREATE INDEX IF NOT EXISTS idx_community_posts_profile_id ON community_posts(profile_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts(category);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_like_count ON community_posts(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_is_pinned ON community_posts(is_pinned) WHERE is_pinned = TRUE;

-- ============================================
-- 3. community_comments (댓글/대댓글)
-- ============================================
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  parent_id UUID DEFAULT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_blinded BOOLEAN NOT NULL DEFAULT FALSE,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_comments_post_id ON community_comments(post_id);
CREATE INDEX idx_community_comments_profile_id ON community_comments(profile_id);
CREATE INDEX idx_community_comments_parent_id ON community_comments(parent_id);
CREATE INDEX idx_community_comments_created_at ON community_comments(created_at);

-- ============================================
-- 4. community_likes (좋아요)
-- ============================================
CREATE TABLE IF NOT EXISTS community_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  post_id UUID DEFAULT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID DEFAULT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_likes_target_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  ),
  CONSTRAINT community_likes_post_unique UNIQUE (profile_id, post_id),
  CONSTRAINT community_likes_comment_unique UNIQUE (profile_id, comment_id)
);

CREATE INDEX idx_community_likes_profile_id ON community_likes(profile_id);
CREATE INDEX idx_community_likes_post_id ON community_likes(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_community_likes_comment_id ON community_likes(comment_id) WHERE comment_id IS NOT NULL;

-- ============================================
-- 5. community_bookmarks (북마크)
-- ============================================
CREATE TABLE IF NOT EXISTS community_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_bookmarks_unique UNIQUE (profile_id, post_id)
);

CREATE INDEX idx_community_bookmarks_profile_id ON community_bookmarks(profile_id);
CREATE INDEX idx_community_bookmarks_post_id ON community_bookmarks(post_id);

-- ============================================
-- 6. community_polls (투표)
-- ============================================
CREATE TABLE IF NOT EXISTS community_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  question VARCHAR(500) NOT NULL,
  is_multiple_choice BOOLEAN NOT NULL DEFAULT FALSE,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  ends_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_polls_post_unique UNIQUE (post_id)
);

CREATE INDEX idx_community_polls_post_id ON community_polls(post_id);

-- ============================================
-- 7. community_poll_options (투표 선택지)
-- ============================================
CREATE TABLE IF NOT EXISTS community_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_text VARCHAR(200) NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_poll_options_poll_id ON community_poll_options(poll_id);

-- ============================================
-- 8. community_poll_votes (투표 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES community_poll_options(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_poll_votes_unique UNIQUE (poll_id, profile_id, option_id)
);

CREATE INDEX idx_community_poll_votes_poll_id ON community_poll_votes(poll_id);
CREATE INDEX idx_community_poll_votes_option_id ON community_poll_votes(option_id);
CREATE INDEX idx_community_poll_votes_profile_id ON community_poll_votes(profile_id);

-- ============================================
-- 9. community_reports (신고)
-- ============================================
CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  post_id UUID DEFAULT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID DEFAULT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  reason VARCHAR(20) NOT NULL,
  detail TEXT DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID DEFAULT NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_reports_target_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  ),
  CONSTRAINT community_reports_reason_check CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'privacy', 'misinformation', 'other')),
  CONSTRAINT community_reports_status_check CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed'))
);

CREATE INDEX idx_community_reports_status ON community_reports(status);
CREATE INDEX idx_community_reports_post_id ON community_reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_community_reports_comment_id ON community_reports(comment_id) WHERE comment_id IS NOT NULL;

-- ============================================
-- 10. community_penalties (제재 이력)
-- ============================================
CREATE TABLE IF NOT EXISTS community_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  duration_days INTEGER DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_penalties_type_check CHECK (type IN ('warning', 'temp_ban', 'permanent_ban'))
);

CREATE INDEX idx_community_penalties_profile_id ON community_penalties(profile_id);
CREATE INDEX idx_community_penalties_is_active ON community_penalties(is_active) WHERE is_active = TRUE;

-- ============================================
-- RLS 활성화
-- ============================================
ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_penalties ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS 정책: community_profiles
-- ============================================
-- 인증 사용자 → SELECT
CREATE POLICY "community_profiles_select" ON community_profiles
  FOR SELECT TO authenticated USING (true);

-- 본인 → INSERT (user_id = auth.uid())
CREATE POLICY "community_profiles_insert" ON community_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 본인 → UPDATE (닉네임, 아바타, 바이오)
CREATE POLICY "community_profiles_update_own" ON community_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- master_admin → UPDATE (ban, warning 등)
CREATE POLICY "community_profiles_update_admin" ON community_profiles
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin'
    )
  );

-- ============================================
-- RLS 정책: community_posts
-- ============================================
-- 인증 사용자 → 비블라인드 게시글 SELECT
CREATE POLICY "community_posts_select" ON community_posts
  FOR SELECT TO authenticated USING (
    is_blinded = FALSE
    OR profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- 비차단 사용자 → INSERT
CREATE POLICY "community_posts_insert" ON community_posts
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (
      SELECT id FROM community_profiles
      WHERE user_id = auth.uid()
        AND is_banned = FALSE
        AND (ban_until IS NULL OR ban_until < NOW())
    )
  );

-- 본인 → UPDATE
CREATE POLICY "community_posts_update" ON community_posts
  FOR UPDATE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- 본인 → DELETE
CREATE POLICY "community_posts_delete" ON community_posts
  FOR DELETE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- RLS 정책: community_comments
-- ============================================
CREATE POLICY "community_comments_select" ON community_comments
  FOR SELECT TO authenticated USING (
    is_blinded = FALSE
    OR profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "community_comments_insert" ON community_comments
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (
      SELECT id FROM community_profiles
      WHERE user_id = auth.uid()
        AND is_banned = FALSE
        AND (ban_until IS NULL OR ban_until < NOW())
    )
  );

CREATE POLICY "community_comments_update" ON community_comments
  FOR UPDATE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "community_comments_delete" ON community_comments
  FOR DELETE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- RLS 정책: community_likes
-- ============================================
CREATE POLICY "community_likes_select" ON community_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_likes_insert" ON community_likes
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "community_likes_delete" ON community_likes
  FOR DELETE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- RLS 정책: community_bookmarks
-- ============================================
CREATE POLICY "community_bookmarks_select" ON community_bookmarks
  FOR SELECT TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "community_bookmarks_insert" ON community_bookmarks
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "community_bookmarks_delete" ON community_bookmarks
  FOR DELETE TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- RLS 정책: community_polls
-- ============================================
CREATE POLICY "community_polls_select" ON community_polls
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_polls_insert" ON community_polls
  FOR INSERT TO authenticated WITH CHECK (
    post_id IN (
      SELECT cp.id FROM community_posts cp
      JOIN community_profiles cpr ON cpr.id = cp.profile_id
      WHERE cpr.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS 정책: community_poll_options
-- ============================================
CREATE POLICY "community_poll_options_select" ON community_poll_options
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_poll_options_insert" ON community_poll_options
  FOR INSERT TO authenticated WITH CHECK (
    poll_id IN (
      SELECT p.id FROM community_polls p
      JOIN community_posts cp ON cp.id = p.post_id
      JOIN community_profiles cpr ON cpr.id = cp.profile_id
      WHERE cpr.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS 정책: community_poll_votes
-- ============================================
CREATE POLICY "community_poll_votes_select" ON community_poll_votes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_poll_votes_insert" ON community_poll_votes
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- RLS 정책: community_reports
-- ============================================
CREATE POLICY "community_reports_insert" ON community_reports
  FOR INSERT TO authenticated WITH CHECK (
    reporter_profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "community_reports_select_admin" ON community_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "community_reports_update_admin" ON community_reports
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- RLS 정책: community_penalties
-- ============================================
CREATE POLICY "community_penalties_select_own" ON community_penalties
  FOR SELECT TO authenticated USING (
    profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "community_penalties_insert_admin" ON community_penalties
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "community_penalties_update_admin" ON community_penalties
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- 함수: 조회수 증가 (SECURITY DEFINER)
-- ============================================
CREATE OR REPLACE FUNCTION increment_community_post_view_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts
  SET view_count = view_count + 1
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: 게시글 좋아요 토글
-- ============================================
CREATE OR REPLACE FUNCTION toggle_community_post_like(p_profile_id UUID, p_post_id UUID)
RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM community_likes WHERE profile_id = p_profile_id AND post_id = p_post_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM community_likes WHERE profile_id = p_profile_id AND post_id = p_post_id;
    UPDATE community_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = p_post_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', false, 'like_count', v_new_count);
  ELSE
    INSERT INTO community_likes (profile_id, post_id) VALUES (p_profile_id, p_post_id);
    UPDATE community_posts SET like_count = like_count + 1 WHERE id = p_post_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', true, 'like_count', v_new_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: 댓글 좋아요 토글
-- ============================================
CREATE OR REPLACE FUNCTION toggle_community_comment_like(p_profile_id UUID, p_comment_id UUID)
RETURNS JSON AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM community_likes WHERE profile_id = p_profile_id AND comment_id = p_comment_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM community_likes WHERE profile_id = p_profile_id AND comment_id = p_comment_id;
    UPDATE community_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', false, 'like_count', v_new_count);
  ELSE
    INSERT INTO community_likes (profile_id, comment_id) VALUES (p_profile_id, p_comment_id);
    UPDATE community_comments SET like_count = like_count + 1 WHERE id = p_comment_id
      RETURNING like_count INTO v_new_count;
    RETURN json_build_object('liked', true, 'like_count', v_new_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 트리거: 신고 5건 누적 시 자동 블라인드
-- ============================================
CREATE OR REPLACE FUNCTION check_auto_blind_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_report_count INTEGER;
BEGIN
  -- 게시글 신고인 경우
  IF NEW.post_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_report_count
    FROM community_reports
    WHERE post_id = NEW.post_id AND status = 'pending';

    IF v_report_count >= 5 THEN
      UPDATE community_posts SET is_blinded = TRUE WHERE id = NEW.post_id;
    END IF;
  END IF;

  -- 댓글 신고인 경우
  IF NEW.comment_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_report_count
    FROM community_reports
    WHERE comment_id = NEW.comment_id AND status = 'pending';

    IF v_report_count >= 5 THEN
      UPDATE community_comments SET is_blinded = TRUE WHERE id = NEW.comment_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_check_auto_blind
  AFTER INSERT ON community_reports
  FOR EACH ROW
  EXECUTE FUNCTION check_auto_blind_threshold();

-- ============================================
-- 트리거: 댓글 수 동기화
-- ============================================
CREATE OR REPLACE FUNCTION update_community_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_comment_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_community_post_comment_count();

-- ============================================
-- 트리거: 프로필 게시글 수 동기화
-- ============================================
CREATE OR REPLACE FUNCTION update_community_profile_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_profiles SET total_posts = total_posts + 1 WHERE id = NEW.profile_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_profiles SET total_posts = GREATEST(0, total_posts - 1) WHERE id = OLD.profile_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_profile_post_count
  AFTER INSERT OR DELETE ON community_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_community_profile_post_count();

-- ============================================
-- 트리거: 프로필 댓글 수 동기화
-- ============================================
CREATE OR REPLACE FUNCTION update_community_profile_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_profiles SET total_comments = total_comments + 1 WHERE id = NEW.profile_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_profiles SET total_comments = GREATEST(0, total_comments - 1) WHERE id = OLD.profile_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_profile_comment_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_community_profile_comment_count();

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================
CREATE OR REPLACE FUNCTION update_community_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_community_profiles_updated_at
  BEFORE UPDATE ON community_profiles
  FOR EACH ROW EXECUTE FUNCTION update_community_updated_at();

CREATE TRIGGER trigger_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION update_community_updated_at();

CREATE TRIGGER trigger_community_comments_updated_at
  BEFORE UPDATE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION update_community_updated_at();

-- ============================================
-- Migration Complete
-- ============================================
