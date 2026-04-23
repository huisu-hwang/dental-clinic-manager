-- ============================================
-- AI 제안 자동 구현 태스크 테이블 + 제안 카테고리 추가
-- Migration: 20260424_ai_suggestion_tasks.sql
-- Created: 2026-04-24
--
-- 목적: 자유게시판 "제안 사항" 글을 마스터 관리자가 승인하면
--       맥미니 워커(ai-suggestion-worker)가 Realtime 구독으로
--       감지하여 Claude Agent SDK로 자동 구현 후 PR을 생성한다.
-- ============================================

-- ============================================
-- 1. "제안 사항" 카테고리 시드
-- ============================================
INSERT INTO community_categories (slug, label, color_bg, color_text, sort_order)
VALUES ('suggestion', '제안 사항', 'bg-pink-100', 'text-pink-700', 6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 2. ai_suggestion_tasks 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS ai_suggestion_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  branch_name TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  commit_sha TEXT,
  worker_log TEXT,
  error_message TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_suggestion_tasks_post_unique UNIQUE (post_id),
  CONSTRAINT ai_suggestion_tasks_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_tasks_post_id ON ai_suggestion_tasks(post_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_tasks_status ON ai_suggestion_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_tasks_created_at ON ai_suggestion_tasks(created_at DESC);

-- ============================================
-- 3. updated_at 자동 갱신 트리거
-- ============================================
CREATE TRIGGER trigger_ai_suggestion_tasks_updated_at
  BEFORE UPDATE ON ai_suggestion_tasks
  FOR EACH ROW EXECUTE FUNCTION update_community_updated_at();

-- ============================================
-- 4. RLS 활성화 및 정책
-- ============================================
ALTER TABLE ai_suggestion_tasks ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 모두 SELECT 가능 (게시글 상세에서 상태 뱃지 표시 위해)
CREATE POLICY "ai_suggestion_tasks_select" ON ai_suggestion_tasks
  FOR SELECT TO authenticated USING (true);

-- master_admin만 INSERT (승인 버튼)
CREATE POLICY "ai_suggestion_tasks_insert_admin" ON ai_suggestion_tasks
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- master_admin만 UPDATE (취소 등). 워커는 service_role 키로 RLS 우회.
CREATE POLICY "ai_suggestion_tasks_update_admin" ON ai_suggestion_tasks
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- ============================================
-- 5. Realtime publication 추가
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_suggestion_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_suggestion_tasks;
  END IF;
END $$;

-- ============================================
-- Migration Complete
-- ============================================
