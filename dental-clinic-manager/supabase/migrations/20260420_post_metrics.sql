-- ============================================
-- 발행 후 KPI 수집 — content_post_metrics 테이블
-- Migration: 20260420_post_metrics
-- Created: 2026-04-20
--
-- 목적:
-- 발행된 글(네이버 블로그 등)의 조회수·댓글·공감·스크랩을 시계열로 누적.
-- 워커가 주기적으로 스크래핑한 결과를 push.
-- ============================================

CREATE TABLE IF NOT EXISTS content_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,        -- 'naver_blog', 'instagram', ...
  views INTEGER,
  comments INTEGER,
  likes INTEGER,                         -- 네이버 블로그: 공감수 / IG: 좋아요
  scraps INTEGER,                        -- 네이버 블로그 스크랩수
  shares INTEGER,                        -- SNS 공유수
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  raw_payload JSONB                      -- 원본 응답 (디버깅·향후 추출)
);

COMMENT ON TABLE content_post_metrics IS '발행 후 KPI 시계열 (스크래핑 누적)';

CREATE INDEX IF NOT EXISTS idx_post_metrics_item
  ON content_post_metrics(item_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_metrics_recent
  ON content_post_metrics(measured_at DESC);

ALTER TABLE content_post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_metrics_clinic_access" ON content_post_metrics
  FOR ALL USING (
    item_id IN (
      SELECT id FROM content_calendar_items
      WHERE calendar_id IN (
        SELECT id FROM content_calendars
        WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
      )
    )
  );

-- 항목별 최신 metrics 조회용 뷰 (UI 카드 한 번에 fetch)
CREATE OR REPLACE VIEW content_post_metrics_latest AS
SELECT DISTINCT ON (item_id, platform)
  item_id, platform, views, comments, likes, scraps, shares, measured_at
FROM content_post_metrics
ORDER BY item_id, platform, measured_at DESC;

COMMENT ON VIEW content_post_metrics_latest IS '항목·플랫폼별 최신 metrics (UI 카드용)';
