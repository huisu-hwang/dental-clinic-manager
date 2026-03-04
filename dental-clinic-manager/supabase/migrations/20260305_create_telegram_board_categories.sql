-- =====================================================
-- 게시판 카테고리 테이블 생성
-- =====================================================

-- 1. 카테고리 테이블
CREATE TABLE telegram_board_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'gray',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_board_category_group_slug UNIQUE (telegram_group_id, slug)
);

CREATE INDEX idx_board_categories_group ON telegram_board_categories(telegram_group_id);

-- 2. posts 테이블에 category_id 추가
ALTER TABLE telegram_board_posts
  ADD COLUMN category_id UUID REFERENCES telegram_board_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_board_posts_category ON telegram_board_posts(category_id);

-- 3. post_count 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_board_category_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.category_id IS NOT NULL THEN
    UPDATE telegram_board_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
      IF OLD.category_id IS NOT NULL THEN
        UPDATE telegram_board_categories SET post_count = GREATEST(0, post_count - 1) WHERE id = OLD.category_id;
      END IF;
      IF NEW.category_id IS NOT NULL THEN
        UPDATE telegram_board_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.category_id IS NOT NULL THEN
    UPDATE telegram_board_categories SET post_count = GREATEST(0, post_count - 1) WHERE id = OLD.category_id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_board_category_post_count
  AFTER INSERT OR UPDATE OR DELETE ON telegram_board_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_board_category_post_count();

-- 4. 기존 활성 그룹마다 "미분류" 기본 카테고리 생성
INSERT INTO telegram_board_categories (telegram_group_id, name, slug, is_default, sort_order, color)
SELECT id, '미분류', 'uncategorized', TRUE, 999, 'gray'
FROM telegram_groups WHERE is_active = TRUE;

-- 5. RLS 정책
ALTER TABLE telegram_board_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_categories_select" ON telegram_board_categories FOR SELECT USING (true);

CREATE POLICY "board_categories_insert" ON telegram_board_categories FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  OR EXISTS (SELECT 1 FROM telegram_groups WHERE id = telegram_group_id AND created_by = auth.uid())
);

CREATE POLICY "board_categories_update" ON telegram_board_categories FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  OR EXISTS (SELECT 1 FROM telegram_groups WHERE id = telegram_group_id AND created_by = auth.uid())
);

CREATE POLICY "board_categories_delete" ON telegram_board_categories FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  OR EXISTS (SELECT 1 FROM telegram_groups WHERE id = telegram_group_id AND created_by = auth.uid())
);
