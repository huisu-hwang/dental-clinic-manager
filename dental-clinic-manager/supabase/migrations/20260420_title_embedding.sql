-- ============================================
-- 제목 임베딩 컬럼 추가 (의미 유사도 중복 검사용)
-- Migration: 20260420_title_embedding
-- Created: 2026-04-20
--
-- 목적:
-- 토큰 Jaccard 유사도는 "임플란트 비용" vs "임플란트 가격"을 잡지 못함.
-- Gemini text-embedding-004 (768차원) JSON 배열로 저장하고,
-- 코사인 유사도로 의미적 중복을 차단.
-- ============================================

ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS title_embedding TEXT;

COMMENT ON COLUMN content_calendar_items.title_embedding IS
  'Gemini text-embedding-004 (768d) JSON-encoded float array. NULL = 미생성';

-- 빈 임베딩 제외 부분 인덱스 (조회 시 NULL 스캔 회피)
CREATE INDEX IF NOT EXISTS idx_calendar_items_has_embedding
  ON content_calendar_items(created_at DESC)
  WHERE title_embedding IS NOT NULL;
