-- ============================================
-- 보안 보정 — telegram_board_posts.file_urls / content 에 박혀 있던
-- BOT_TOKEN 포함 URL(`https://api.telegram.org/file/bot<TOKEN>/...`)을
-- 서버 프록시(`/api/telegram/files/[messageId]`) URL 로 일괄 치환.
--
-- 원인: supabase webhook 함수가 file_id → file_path → 직링크를 만들어 그대로
-- DB 에 저장했으나 (1) Telegram file_path 는 1시간 만료, (2) URL 에 BOT_TOKEN
-- 이 포함되어 클라이언트 / DB 에 노출되는 보안 사고가 동반되었음.
--
-- 처리:
--  1) file_urls[*].url 을 source_message_ids[0] 기준의 우리 프록시 URL 로 치환
--     (배열 인덱스가 1대1 매핑되도록 webhook 함수가 항상 단일 메시지/단일 파일을
--      넣고 있어, 첫 source_message_id 만 사용해도 충분)
--  2) content HTML 안의 토큰 노출 URL 도 모두 동일 프록시로 치환
--
-- Migration: 20260511_telegram_board_posts_strip_bot_token_urls.sql
-- Created: 2026-05-11
-- ============================================

UPDATE telegram_board_posts AS p
SET
  file_urls = (
    SELECT jsonb_agg(
      CASE
        WHEN (f->>'url') LIKE 'https://api.telegram.org/file/bot%' AND p.source_message_ids IS NOT NULL AND array_length(p.source_message_ids, 1) >= 1
          THEN jsonb_set(f, '{url}', to_jsonb('/api/telegram/files/' || (p.source_message_ids[1])::text), true)
        ELSE f
      END
    )
    FROM jsonb_array_elements(COALESCE(p.file_urls, '[]'::jsonb)) AS f
  ),
  content = CASE
    WHEN p.content ~ 'https://api\.telegram\.org/file/bot[^/"]+/'
      AND p.source_message_ids IS NOT NULL
      AND array_length(p.source_message_ids, 1) >= 1
    THEN regexp_replace(
      p.content,
      'https://api\.telegram\.org/file/bot[^"<\s]+',
      '/api/telegram/files/' || (p.source_message_ids[1])::text,
      'g'
    )
    ELSE p.content
  END
WHERE (
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p.file_urls, '[]'::jsonb)) AS f
    WHERE (f->>'url') LIKE 'https://api.telegram.org/file/bot%'
  )
  OR p.content ~ 'https://api\.telegram\.org/file/bot[^/"]+/'
);

-- telegram_messages 에도 동일 토큰 URL 이 file_url 컬럼에 저장되어 있을 수 있음
UPDATE telegram_messages
SET file_url = NULL
WHERE file_url LIKE 'https://api.telegram.org/file/bot%';
