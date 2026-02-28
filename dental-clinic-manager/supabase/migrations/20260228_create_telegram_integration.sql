-- ============================================
-- 텔레그램 그룹채팅 연동 테이블
-- Migration: 20260228_create_telegram_integration.sql
-- Created: 2026-02-28
--
-- 5개 테이블:
-- 1. telegram_groups - 연동된 텔레그램 그룹 관리
-- 2. telegram_group_members - 그룹별 멤버 매핑 (접근 제어)
-- 3. telegram_invite_links - 초대 링크 관리
-- 4. telegram_messages - 메시지 버퍼 (일일 요약용)
-- 5. telegram_board_posts - 생성된 게시글 (AI 요약/파일/링크)
-- ============================================

-- =====================
-- 1. telegram_groups
-- =====================
CREATE TABLE telegram_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL,
  chat_title VARCHAR(255) NOT NULL,
  chat_type VARCHAR(20) NOT NULL DEFAULT 'group',
  board_slug VARCHAR(50) NOT NULL,
  board_title VARCHAR(100) NOT NULL,
  board_description TEXT DEFAULT NULL,
  color_bg VARCHAR(50) NOT NULL DEFAULT 'bg-sky-100',
  color_text VARCHAR(50) NOT NULL DEFAULT 'text-sky-700',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_secret VARCHAR(100) DEFAULT NULL,
  last_sync_at TIMESTAMPTZ DEFAULT NULL,
  summary_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  summary_time VARCHAR(5) NOT NULL DEFAULT '23:00',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_groups_chat_id_unique UNIQUE (telegram_chat_id),
  CONSTRAINT telegram_groups_board_slug_unique UNIQUE (board_slug)
);

CREATE INDEX idx_telegram_groups_is_active ON telegram_groups(is_active) WHERE is_active = TRUE;

-- =====================
-- 2. telegram_group_members
-- =====================
CREATE TABLE telegram_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_via VARCHAR(20) NOT NULL DEFAULT 'invite_link',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_group_members_unique UNIQUE (telegram_group_id, user_id)
);

CREATE INDEX idx_telegram_group_members_user ON telegram_group_members(user_id);
CREATE INDEX idx_telegram_group_members_group ON telegram_group_members(telegram_group_id);

-- =====================
-- 3. telegram_invite_links
-- =====================
CREATE TABLE telegram_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  invite_code VARCHAR(20) NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses INTEGER DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_invite_links_code_unique UNIQUE (invite_code)
);

CREATE INDEX idx_telegram_invite_links_code ON telegram_invite_links(invite_code) WHERE is_active = TRUE;
CREATE INDEX idx_telegram_invite_links_group ON telegram_invite_links(telegram_group_id);

-- =====================
-- 4. telegram_messages
-- =====================
CREATE TABLE telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_username VARCHAR(100) DEFAULT NULL,
  message_text TEXT DEFAULT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
  has_file BOOLEAN NOT NULL DEFAULT FALSE,
  has_link BOOLEAN NOT NULL DEFAULT FALSE,
  file_id VARCHAR(255) DEFAULT NULL,
  file_name VARCHAR(500) DEFAULT NULL,
  file_url TEXT DEFAULT NULL,
  file_mime_type VARCHAR(100) DEFAULT NULL,
  file_size BIGINT DEFAULT NULL,
  extracted_links JSONB DEFAULT '[]'::jsonb,
  raw_update JSONB NOT NULL,
  is_summarized BOOLEAN NOT NULL DEFAULT FALSE,
  is_posted BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_messages_unique UNIQUE (telegram_chat_id, telegram_message_id)
);

CREATE INDEX idx_telegram_messages_group ON telegram_messages(telegram_group_id);
CREATE INDEX idx_telegram_messages_date ON telegram_messages(telegram_date);
CREATE INDEX idx_telegram_messages_unsummarized ON telegram_messages(telegram_group_id, is_summarized)
  WHERE is_summarized = FALSE;

-- =====================
-- 5. telegram_board_posts
-- =====================
CREATE TABLE telegram_board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  post_type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  source_message_ids UUID[] DEFAULT '{}',
  summary_date DATE DEFAULT NULL,
  file_urls JSONB DEFAULT '[]'::jsonb,
  link_urls JSONB DEFAULT '[]'::jsonb,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ai_model VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telegram_board_posts_group ON telegram_board_posts(telegram_group_id);
CREATE INDEX idx_telegram_board_posts_type ON telegram_board_posts(post_type);
CREATE INDEX idx_telegram_board_posts_created ON telegram_board_posts(created_at DESC);
CREATE INDEX idx_telegram_board_posts_summary_date ON telegram_board_posts(summary_date)
  WHERE post_type = 'summary';

-- =====================
-- updated_at 트리거
-- =====================
CREATE OR REPLACE FUNCTION update_telegram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_telegram_groups_updated_at
  BEFORE UPDATE ON telegram_groups FOR EACH ROW EXECUTE FUNCTION update_telegram_updated_at();

CREATE TRIGGER trigger_telegram_board_posts_updated_at
  BEFORE UPDATE ON telegram_board_posts FOR EACH ROW EXECUTE FUNCTION update_telegram_updated_at();

-- =====================
-- 조회수 증가 함수
-- =====================
CREATE OR REPLACE FUNCTION increment_telegram_post_view_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE telegram_board_posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- RLS 정책
-- =====================

-- telegram_groups: 로그인 사용자 조회 가능, master_admin만 관리
ALTER TABLE telegram_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_groups_select" ON telegram_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_groups_insert" ON telegram_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "telegram_groups_update" ON telegram_groups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "telegram_groups_delete" ON telegram_groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- telegram_group_members: 본인 멤버십 조회, master_admin 관리, 초대 링크로 자가 가입
ALTER TABLE telegram_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_members_select_own" ON telegram_group_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "telegram_members_select_admin" ON telegram_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "telegram_members_insert_admin" ON telegram_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR user_id = auth.uid()
  );

CREATE POLICY "telegram_members_delete_admin" ON telegram_group_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
    OR user_id = auth.uid()
  );

-- telegram_invite_links: master_admin 관리, authenticated 조회(검증용)
ALTER TABLE telegram_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_invite_links_select" ON telegram_invite_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "telegram_invite_links_insert" ON telegram_invite_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "telegram_invite_links_update" ON telegram_invite_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

CREATE POLICY "telegram_invite_links_delete" ON telegram_invite_links
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- telegram_messages: 해당 그룹 멤버만 조회
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_messages_select_member" ON telegram_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telegram_group_members
      WHERE telegram_group_members.telegram_group_id = telegram_messages.telegram_group_id
      AND telegram_group_members.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- telegram_board_posts: 해당 그룹 멤버만 조회
ALTER TABLE telegram_board_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_board_posts_select_member" ON telegram_board_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telegram_group_members
      WHERE telegram_group_members.telegram_group_id = telegram_board_posts.telegram_group_id
      AND telegram_group_members.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- Migration Complete
-- ============================================
