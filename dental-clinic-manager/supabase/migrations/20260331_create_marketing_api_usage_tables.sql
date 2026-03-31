-- ============================================
-- 마케팅 API 비용 추적 테이블
-- Created: 2026-03-31
-- ============================================

-- 1. API 사용량 기록 테이블
CREATE TABLE marketing_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  post_id UUID,
  generation_session_id UUID NOT NULL,
  api_provider VARCHAR(20) NOT NULL,
  model VARCHAR(50) NOT NULL,
  call_type VARCHAR(30) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  generation_options JSONB,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_clinic_created ON marketing_api_usage(clinic_id, created_at DESC);
CREATE INDEX idx_api_usage_session ON marketing_api_usage(generation_session_id);
CREATE INDEX idx_api_usage_post ON marketing_api_usage(post_id) WHERE post_id IS NOT NULL;

ALTER TABLE marketing_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin can view all api usage"
  ON marketing_api_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'master_admin'
    )
  );

CREATE POLICY "authenticated users can insert api usage"
  ON marketing_api_usage FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- 2. 비용 설정 테이블
CREATE TABLE marketing_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  model VARCHAR(50) NOT NULL,
  input_price_per_1m DECIMAL(10,4) DEFAULT 0,
  output_price_per_1m DECIMAL(10,4) DEFAULT 0,
  image_price_per_call DECIMAL(10,4) DEFAULT 0,
  usd_to_krw DECIMAL(10,2) DEFAULT 1380.00,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, model)
);

ALTER TABLE marketing_cost_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin can manage cost settings"
  ON marketing_cost_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'master_admin'
    )
  );

-- 3. 기본 단가 시드 함수
CREATE OR REPLACE FUNCTION seed_marketing_cost_settings(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO marketing_cost_settings (clinic_id, model, input_price_per_1m, output_price_per_1m, image_price_per_call, usd_to_krw)
  VALUES
    (p_clinic_id, 'claude-sonnet-4-6', 3.0000, 15.0000, 0, 1380.00),
    (p_clinic_id, 'claude-haiku-4-5', 0.8000, 4.0000, 0, 1380.00),
    (p_clinic_id, 'gemini-3.0-flash', 0, 0, 0.0400, 1380.00),
    (p_clinic_id, 'exchange_rate', 0, 0, 0, 1380.00)
  ON CONFLICT (clinic_id, model) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
