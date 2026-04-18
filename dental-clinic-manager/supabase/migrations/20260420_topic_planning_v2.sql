-- ============================================
-- 주제 기획 엔진 v2 — 환자 여정·카테고리·시즌·의료광고 플래그 지원
-- Migration: 20260420_topic_planning_v2
-- Created: 2026-04-20
--
-- 목적:
-- 1) content_calendar_items에 주제 기획 고도화 필드 추가
--    - topic_category: 6축 카테고리 분류 (info/symptom/treatment/cost/review/clinic_news)
--    - journey_stage: 환자 여정 단계 (awareness/consideration/decision/retention)
--    - needs_medical_review: 의료광고 심의 필요 플래그
--    - planning_rationale: AI 기획 근거 (UX용)
--    - estimated_search_volume: 예상 월간 검색량 (네이버 검색광고 API)
-- 2) naver_keyword_insights_cache 테이블 신설 (API 쿼터 절감)
-- ============================================

-- 1. content_calendar_items 신규 컬럼
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS topic_category VARCHAR(20),
  ADD COLUMN IF NOT EXISTS journey_stage VARCHAR(20),
  ADD COLUMN IF NOT EXISTS needs_medical_review BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS planning_rationale TEXT,
  ADD COLUMN IF NOT EXISTS estimated_search_volume INTEGER;

COMMENT ON COLUMN content_calendar_items.topic_category IS '주제 카테고리: info|symptom|treatment|cost|review|clinic_news';
COMMENT ON COLUMN content_calendar_items.journey_stage IS '환자 여정 단계: awareness|consideration|decision|retention';
COMMENT ON COLUMN content_calendar_items.needs_medical_review IS '의료광고 사전심의 필요 여부 (후기/시술성 콘텐츠)';
COMMENT ON COLUMN content_calendar_items.planning_rationale IS 'AI가 이 주제를 선정한 이유 (사용자 검토용)';
COMMENT ON COLUMN content_calendar_items.estimated_search_volume IS '예상 월간 검색량 (네이버 검색광고 API)';

-- 2. 검색량 조회 필터용 인덱스
CREATE INDEX IF NOT EXISTS idx_calendar_items_topic_category
  ON content_calendar_items(topic_category);
CREATE INDEX IF NOT EXISTS idx_calendar_items_journey_stage
  ON content_calendar_items(journey_stage);
CREATE INDEX IF NOT EXISTS idx_calendar_items_needs_review
  ON content_calendar_items(needs_medical_review) WHERE needs_medical_review = true;

-- 3. 네이버 검색광고/데이터랩 API 응답 캐시 테이블
CREATE TABLE IF NOT EXISTS naver_keyword_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) NOT NULL UNIQUE,
  monthly_pc_qc INTEGER,          -- PC 월간 조회수
  monthly_mobile_qc INTEGER,      -- 모바일 월간 조회수
  comp_idx VARCHAR(10),           -- 경쟁도 (낮음/중간/높음)
  rel_keywords JSONB DEFAULT '[]',  -- 연관 키워드 배열
  trend_data JSONB,               -- 데이터랩 트렌드 (시계열)
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE naver_keyword_insights_cache IS '네이버 검색광고/데이터랩 API 응답 캐시 (24시간 TTL)';

CREATE INDEX IF NOT EXISTS idx_naver_cache_fetched_at
  ON naver_keyword_insights_cache(fetched_at DESC);

ALTER TABLE naver_keyword_insights_cache ENABLE ROW LEVEL SECURITY;

-- 캐시는 인증된 사용자 누구나 읽기/쓰기 가능 (키워드 데이터는 민감 정보 아님)
CREATE POLICY "naver_keyword_cache_authenticated" ON naver_keyword_insights_cache
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. 카테고리/여정 값 검증용 CHECK 제약 (느슨하게 — NULL 허용)
ALTER TABLE content_calendar_items
  ADD CONSTRAINT chk_topic_category
  CHECK (topic_category IS NULL OR topic_category IN ('info', 'symptom', 'treatment', 'cost', 'review', 'clinic_news'));

ALTER TABLE content_calendar_items
  ADD CONSTRAINT chk_journey_stage
  CHECK (journey_stage IS NULL OR journey_stage IN ('awareness', 'consideration', 'decision', 'retention'));

-- ============================================
-- Migration Complete
-- ============================================
