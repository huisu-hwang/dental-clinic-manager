-- ============================================
-- 마케팅 자동화 시스템 테이블
-- Migration: 20260317_create_marketing_tables
-- Created: 2026-03-17
-- ============================================

-- 1. 플랫폼 설정
CREATE TABLE marketing_platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, platform)
);

COMMENT ON TABLE marketing_platform_settings IS '마케팅 플랫폼 연동 설정 (네이버블로그, 인스타, 페이스북, 쓰레드)';

-- 2. 프롬프트 관리
CREATE TABLE marketing_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL,
  prompt_key VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  system_prompt TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, prompt_key, version)
);

COMMENT ON TABLE marketing_prompts IS 'AI 글/이미지 생성 프롬프트 관리 (마스터 전용)';

-- 3. 프롬프트 변경 이력
CREATE TABLE marketing_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES marketing_prompts(id) ON DELETE CASCADE,
  prompt_key VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  previous_content TEXT,
  new_content TEXT,
  changed_by UUID REFERENCES users(id),
  change_note TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE marketing_prompt_history IS '프롬프트 변경 이력 (버전 관리)';

-- 4. 콘텐츠 캘린더
CREATE TABLE content_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE content_calendars IS '콘텐츠 캘린더 (주간/월간 발행 계획)';

-- 5. 캘린더 항목
CREATE TABLE content_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES content_calendars(id) ON DELETE CASCADE,
  publish_date DATE NOT NULL,
  publish_time TIME NOT NULL,
  title VARCHAR(200) NOT NULL,
  topic TEXT,
  keyword VARCHAR(100),
  post_type VARCHAR(20) NOT NULL,
  tone VARCHAR(20) DEFAULT 'friendly',
  use_research BOOLEAN DEFAULT FALSE,
  fact_check BOOLEAN DEFAULT FALSE,
  platforms JSONB DEFAULT '{"naverBlog": true}',
  status VARCHAR(20) DEFAULT 'proposed',
  generated_content TEXT,
  generated_images JSONB,
  published_urls JSONB,
  fail_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE content_calendar_items IS '캘린더 개별 항목 (글 계획 + 생성 + 발행 상태)';

-- 6. 임상글 사진
CREATE TABLE clinical_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  photo_type VARCHAR(20) NOT NULL,
  file_path TEXT NOT NULL,
  caption TEXT,
  patient_consent BOOLEAN DEFAULT FALSE,
  anonymized BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE clinical_photos IS '임상글 사진 (전/후/과정/X-ray)';

-- 7. 발행 로그
CREATE TABLE content_publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  published_url TEXT,
  error_message TEXT,
  duration_seconds INTEGER,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE content_publish_logs IS '플랫폼별 발행 결과 로그';

-- 8. 키워드 발행 이력
CREATE TABLE keyword_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  published_at DATE NOT NULL,
  item_id UUID REFERENCES content_calendar_items(id) ON DELETE SET NULL,
  UNIQUE(clinic_id, keyword, published_at)
);

COMMENT ON TABLE keyword_publish_history IS '키워드별 발행 이력 (중복 발행 방지)';

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_marketing_platform_clinic ON marketing_platform_settings(clinic_id);
CREATE INDEX idx_marketing_prompts_clinic_key ON marketing_prompts(clinic_id, prompt_key);
CREATE INDEX idx_marketing_prompts_active ON marketing_prompts(clinic_id, is_active);
CREATE INDEX idx_content_calendars_clinic ON content_calendars(clinic_id);
CREATE INDEX idx_content_calendars_status ON content_calendars(status);
CREATE INDEX idx_calendar_items_calendar ON content_calendar_items(calendar_id);
CREATE INDEX idx_calendar_items_status ON content_calendar_items(status);
CREATE INDEX idx_calendar_items_publish_date ON content_calendar_items(publish_date, publish_time);
CREATE INDEX idx_clinical_photos_item ON clinical_photos(item_id);
CREATE INDEX idx_publish_logs_item ON content_publish_logs(item_id);
CREATE INDEX idx_keyword_history_clinic ON keyword_publish_history(clinic_id, keyword);

-- ============================================
-- RLS 정책
-- ============================================
ALTER TABLE marketing_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_publish_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_publish_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_platform_settings_clinic_access" ON marketing_platform_settings
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "marketing_prompts_clinic_access" ON marketing_prompts
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "marketing_prompt_history_access" ON marketing_prompt_history
  FOR ALL USING (prompt_id IN (SELECT id FROM marketing_prompts WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())));

CREATE POLICY "content_calendars_clinic_access" ON content_calendars
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "content_calendar_items_access" ON content_calendar_items
  FOR ALL USING (calendar_id IN (SELECT id FROM content_calendars WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())));

CREATE POLICY "clinical_photos_access" ON clinical_photos
  FOR ALL USING (item_id IN (SELECT id FROM content_calendar_items WHERE calendar_id IN (SELECT id FROM content_calendars WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()))));

CREATE POLICY "content_publish_logs_access" ON content_publish_logs
  FOR ALL USING (item_id IN (SELECT id FROM content_calendar_items WHERE calendar_id IN (SELECT id FROM content_calendars WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()))));

CREATE POLICY "keyword_publish_history_clinic_access" ON keyword_publish_history
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_marketing_platform_updated
  BEFORE UPDATE ON marketing_platform_settings
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trigger_marketing_prompts_updated
  BEFORE UPDATE ON marketing_prompts
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER trigger_calendar_items_updated
  BEFORE UPDATE ON content_calendar_items
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();
