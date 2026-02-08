-- ============================================
-- 커뮤니티 카테고리(주제) 동적 관리 테이블
-- Migration: 20260208_create_community_categories.sql
-- Created: 2026-02-08
--
-- 목적: 마스터 관리자가 게시판 주제(카테고리)를
--       동적으로 추가/수정/삭제/정렬할 수 있도록 지원
-- ============================================

-- ============================================
-- 1. community_categories 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS community_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(30) NOT NULL,
  label VARCHAR(50) NOT NULL,
  color_bg VARCHAR(50) NOT NULL DEFAULT 'bg-gray-100',
  color_text VARCHAR(50) NOT NULL DEFAULT 'text-gray-700',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_categories_slug_unique UNIQUE (slug),
  CONSTRAINT community_categories_slug_length CHECK (char_length(slug) >= 2 AND char_length(slug) <= 30)
);

CREATE INDEX idx_community_categories_sort_order ON community_categories(sort_order);
CREATE INDEX idx_community_categories_is_active ON community_categories(is_active) WHERE is_active = TRUE;

-- ============================================
-- 2. 기존 카테고리 데이터 시드
-- ============================================
INSERT INTO community_categories (slug, label, color_bg, color_text, sort_order) VALUES
  ('free',   '자유게시판', 'bg-gray-100',   'text-gray-700',   0),
  ('advice', '질문/조언',  'bg-blue-100',   'text-blue-700',   1),
  ('info',   '정보공유',   'bg-green-100',  'text-green-700',  2),
  ('humor',  '유머',       'bg-yellow-100', 'text-yellow-700', 3),
  ('daily',  '일상',       'bg-purple-100', 'text-purple-700', 4),
  ('career', '커리어',     'bg-orange-100', 'text-orange-700', 5)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. community_posts.category CHECK 제약 제거
--    (동적 카테고리를 지원하기 위해)
--    community_posts 테이블이 아직 없으면 스킵
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_posts') THEN
    ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_category_check;
  END IF;
END $$;

-- ============================================
-- 4. RLS 활성화 및 정책
-- ============================================
ALTER TABLE community_categories ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 → 활성 카테고리 SELECT
CREATE POLICY "community_categories_select" ON community_categories
  FOR SELECT TO authenticated USING (true);

-- master_admin → INSERT
CREATE POLICY "community_categories_insert_admin" ON community_categories
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- master_admin → UPDATE
CREATE POLICY "community_categories_update_admin" ON community_categories
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- master_admin → DELETE
CREATE POLICY "community_categories_delete_admin" ON community_categories
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- 5. updated_at 자동 갱신 트리거
-- ============================================
-- 트리거 함수가 아직 없으면 생성 (20260209 마이그레이션보다 먼저 실행될 수 있음)
CREATE OR REPLACE FUNCTION update_community_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_community_categories_updated_at
  BEFORE UPDATE ON community_categories
  FOR EACH ROW EXECUTE FUNCTION update_community_updated_at();

-- ============================================
-- Migration Complete
-- ============================================
