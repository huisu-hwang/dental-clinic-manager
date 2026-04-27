-- ============================================
-- AI 제안 follow-up: 마스터 댓글 → 채널 라우팅
-- Migration: 20260427_ai_suggestion_followup_via_comment.sql
-- Created: 2026-04-27
--
-- 목적:
--   1) community_comments에 is_master_only 컬럼 추가 (마스터 전용 댓글)
--   2) BEFORE INSERT 트리거: master_admin이 'suggestion' 카테고리 글에 단 댓글은
--      자동으로 is_master_only=TRUE 설정
--   3) SELECT RLS 정책 갱신: 마스터 전용 댓글은 작성자/master_admin에게만 노출
--   4) AFTER INSERT 트리거: 마스터 댓글 + 종료된 ai_suggestion_tasks가 있는 글이면
--      pg_net으로 Hookdeck에 POST → 맥미니 Claude Code 채널로 follow-up 전달
-- ============================================

-- 1) is_master_only 컬럼
ALTER TABLE community_comments
  ADD COLUMN IF NOT EXISTS is_master_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_community_comments_master_only
  ON community_comments(post_id) WHERE is_master_only = TRUE;

-- 2) BEFORE INSERT: master_admin + 'suggestion' 카테고리 → is_master_only=TRUE 자동 설정
CREATE OR REPLACE FUNCTION auto_mark_master_only_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_post_category TEXT;
BEGIN
  SELECT u.role INTO v_user_role
  FROM community_profiles cp
  JOIN users u ON u.id = cp.user_id
  WHERE cp.id = NEW.profile_id;

  SELECT category INTO v_post_category
  FROM community_posts
  WHERE id = NEW.post_id;

  IF v_user_role = 'master_admin' AND v_post_category = 'suggestion' THEN
    NEW.is_master_only := TRUE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION auto_mark_master_only_comment() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_auto_mark_master_only_comment ON community_comments;
CREATE TRIGGER trigger_auto_mark_master_only_comment
  BEFORE INSERT ON community_comments
  FOR EACH ROW
  EXECUTE FUNCTION auto_mark_master_only_comment();

-- 3) SELECT RLS 갱신: 마스터 전용 댓글은 작성자/마스터에게만
DROP POLICY IF EXISTS "community_comments_select" ON community_comments;
CREATE POLICY "community_comments_select" ON community_comments
  FOR SELECT TO authenticated USING (
    (is_blinded = FALSE AND is_master_only = FALSE)
    OR profile_id IN (SELECT id FROM community_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );

-- 4) AFTER INSERT: follow-up 채널 webhook
CREATE OR REPLACE FUNCTION notify_ai_suggestion_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := 'https://hkdk.events/7of055c03b2wja';
  v_secret TEXT := 'f06dff5e1833c60f6bfa8cbad69fe59b56eb4c37c5e75ac9';
  v_post_category TEXT;
  v_post_title TEXT;
  v_task_id UUID;
  v_task_status TEXT;
  v_branch TEXT;
  v_pr_url TEXT;
  v_pr_number INT;
BEGIN
  IF NEW.is_master_only IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT category, title INTO v_post_category, v_post_title
  FROM community_posts WHERE id = NEW.post_id;
  IF v_post_category IS DISTINCT FROM 'suggestion' THEN
    RETURN NEW;
  END IF;

  SELECT id, status, branch_name, pr_url, pr_number
    INTO v_task_id, v_task_status, v_branch, v_pr_url, v_pr_number
  FROM ai_suggestion_tasks
  WHERE post_id = NEW.post_id
  LIMIT 1;

  -- 원본 task가 없거나 진행 중(pending/running)이면 follow-up 보류
  IF v_task_id IS NULL OR v_task_status NOT IN ('completed','failed','cancelled') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', 'FOLLOWUP',
      'table', 'community_comments',
      'schema', 'public',
      'record', jsonb_build_object(
        'id', NEW.id,
        'post_id', NEW.post_id,
        'content', NEW.content,
        'task_id', v_task_id,
        'task_status', v_task_status,
        'branch_name', v_branch,
        'pr_url', v_pr_url,
        'pr_number', v_pr_number,
        'post_title', v_post_title
      )
    )
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notify_ai_suggestion_followup() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_notify_ai_suggestion_followup ON community_comments;
CREATE TRIGGER trigger_notify_ai_suggestion_followup
  AFTER INSERT ON community_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_ai_suggestion_followup();

-- ============================================
-- Migration Complete
-- ============================================
