-- shared_links 테이블 생성
CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(32) NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('announcement', 'document', 'community_post')),
  source_id UUID NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('authenticated', 'public')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 동일 게시물+동일 접근레벨에 중복 링크 방지
  UNIQUE(source_type, source_id, access_level)
);

-- 인덱스
CREATE INDEX idx_shared_links_token ON shared_links(token);
CREATE INDEX idx_shared_links_source ON shared_links(source_type, source_id);

-- RLS 활성화
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

-- 정책: 누구나 토큰으로 조회 가능 (공유 페이지에서 사용)
CREATE POLICY "shared_links_select_all" ON shared_links
  FOR SELECT USING (true);

-- 정책: 인증된 사용자만 생성
CREATE POLICY "shared_links_insert_authenticated" ON shared_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 정책: 생성자만 수정 (비활성화 등)
CREATE POLICY "shared_links_update_owner" ON shared_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

-- 정책: 생성자만 삭제
CREATE POLICY "shared_links_delete_owner" ON shared_links
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);
