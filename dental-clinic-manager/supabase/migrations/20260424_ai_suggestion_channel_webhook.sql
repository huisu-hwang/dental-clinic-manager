-- ============================================
-- AI 제안 채널 webhook trigger
-- Migration: 20260424_ai_suggestion_channel_webhook.sql
-- Created: 2026-04-24
--
-- 목적: ai_suggestion_tasks에 pending 태스크가 INSERT되면
--       pg_net으로 Hookdeck URL에 POST하여 맥미니의 Claude Code 세션에 알림.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 주의: Hookdeck URL과 WEBHOOK_SECRET은 함수 바디에 하드코딩됨.
-- SECURITY DEFINER로 함수 정의 조회는 소유자 권한 필요 → 일반 사용자는 값을 볼 수 없음.
-- rotate 필요 시 CREATE OR REPLACE로 함수 재정의.
CREATE OR REPLACE FUNCTION notify_ai_suggestion_channel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := 'https://hkdk.events/7of055c03b2wja';
  v_secret TEXT := 'f06dff5e1833c60f6bfa8cbad69fe59b56eb4c37c5e75ac9';
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'ai_suggestion_tasks',
        'schema', 'public',
        'record', to_jsonb(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_ai_suggestion_channel() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_notify_ai_suggestion_channel ON ai_suggestion_tasks;

CREATE TRIGGER trigger_notify_ai_suggestion_channel
  AFTER INSERT ON ai_suggestion_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_ai_suggestion_channel();

-- ============================================
-- Migration Complete
-- ============================================
