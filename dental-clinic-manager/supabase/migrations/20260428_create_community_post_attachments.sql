-- =====================================================
-- 커뮤니티 게시판 첨부 파일 테이블
-- Community Post Attachments
-- Created: 2026-04-28
-- =====================================================
-- 자유게시판 게시글에 파일/이미지를 첨부할 수 있도록 메타데이터 테이블 추가.
-- 실제 파일은 기존 'bulletin-files' Storage 버킷(public, 10MB 제한)에 저장.

CREATE TABLE IF NOT EXISTS community_post_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  uploader_profile_id UUID REFERENCES community_profiles(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  file_type VARCHAR(100) NOT NULL,
  storage_path VARCHAR(500) NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_post_attachments_post_id
  ON community_post_attachments(post_id, sort_order);

ALTER TABLE community_post_attachments ENABLE ROW LEVEL SECURITY;

-- 인증 사용자: 모든 첨부 메타데이터 조회 가능 (게시글 SELECT RLS는 별도)
DROP POLICY IF EXISTS "community_post_attachments_select" ON community_post_attachments;
CREATE POLICY "community_post_attachments_select" ON community_post_attachments
  FOR SELECT TO authenticated USING (true);

-- 게시글 작성자(또는 마스터 관리자)만 첨부 추가 가능
DROP POLICY IF EXISTS "community_post_attachments_insert" ON community_post_attachments;
CREATE POLICY "community_post_attachments_insert" ON community_post_attachments
  FOR INSERT TO authenticated WITH CHECK (
    post_id IN (
      SELECT cp.id FROM community_posts cp
      JOIN community_profiles cpr ON cpr.id = cp.profile_id
      WHERE cpr.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin'
    )
  );

-- 게시글 작성자(또는 마스터 관리자)만 첨부 삭제 가능
DROP POLICY IF EXISTS "community_post_attachments_delete" ON community_post_attachments;
CREATE POLICY "community_post_attachments_delete" ON community_post_attachments
  FOR DELETE TO authenticated USING (
    post_id IN (
      SELECT cp.id FROM community_posts cp
      JOIN community_profiles cpr ON cpr.id = cp.profile_id
      WHERE cpr.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin'
    )
  );

COMMENT ON TABLE community_post_attachments IS '커뮤니티 자유게시판 게시글 첨부 파일(이미지/문서) 메타데이터';
COMMENT ON COLUMN community_post_attachments.storage_path IS 'bulletin-files 버킷 내 파일 경로';
COMMENT ON COLUMN community_post_attachments.public_url IS 'Supabase Storage public URL';
