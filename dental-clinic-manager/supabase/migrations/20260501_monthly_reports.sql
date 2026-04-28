-- ============================================
-- 월간 성과 보고서 테이블 + 덴트웹 환자 유입경로 컬럼 추가
-- Migration: 20260501_monthly_reports.sql
-- Created: 2026-05-01
-- ============================================

-- 1) 덴트웹 환자 테이블에 유입경로/고객구분 컬럼 추가
ALTER TABLE dentweb_patients
  ADD COLUMN IF NOT EXISTS acquisition_channel TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT;

CREATE INDEX IF NOT EXISTS idx_dentweb_patients_acquisition_channel
  ON dentweb_patients(clinic_id, acquisition_channel)
  WHERE acquisition_channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dentweb_patients_registration_date
  ON dentweb_patients(clinic_id, registration_date)
  WHERE registration_date IS NOT NULL;

-- 2) 월간 보고서 테이블 생성
CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  revenue_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_patient_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  acquisition_channel_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_distribution_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('cron', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clinic_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_clinic_year_month
  ON monthly_reports(clinic_id, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_generated_at
  ON monthly_reports(generated_at DESC);

-- 3) updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_monthly_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_monthly_reports_updated_at ON monthly_reports;
CREATE TRIGGER trigger_update_monthly_reports_updated_at
  BEFORE UPDATE ON monthly_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_reports_updated_at();

-- 4) RLS 정책
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_reports_select_owner_manager" ON monthly_reports;
CREATE POLICY "monthly_reports_select_owner_manager"
  ON monthly_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.clinic_id = monthly_reports.clinic_id
        AND users.role IN ('owner', 'manager', 'vice_director', 'master_admin')
    )
  );

DROP POLICY IF EXISTS "monthly_reports_insert_service" ON monthly_reports;
CREATE POLICY "monthly_reports_insert_service"
  ON monthly_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.clinic_id = monthly_reports.clinic_id
        AND users.role IN ('owner', 'master_admin')
    )
  );

DROP POLICY IF EXISTS "monthly_reports_update_service" ON monthly_reports;
CREATE POLICY "monthly_reports_update_service"
  ON monthly_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.clinic_id = monthly_reports.clinic_id
        AND users.role IN ('owner', 'master_admin')
    )
  );

COMMENT ON TABLE monthly_reports IS '월간 성과 보고서 스냅샷 (매월 1일 새벽 KST 자동 생성)';
COMMENT ON COLUMN monthly_reports.revenue_data IS '월별 매출 추이 (12개월 시계열): [{year, month, total_revenue, insurance, non_insurance}]';
COMMENT ON COLUMN monthly_reports.new_patient_data IS '월별 신환 수 추이 (12개월 시계열): [{year, month, count}]';
COMMENT ON COLUMN monthly_reports.acquisition_channel_data IS '월별 유입경로 분포 (12개월 시계열): [{year, month, channels: {소개, 인터넷, ...}}]';
COMMENT ON COLUMN monthly_reports.age_distribution_data IS '월별 신환 연령대 분포 (12개월 시계열): [{year, month, groups: {under_10, teens, twenties, ...}}]';
COMMENT ON COLUMN monthly_reports.summary IS '핵심 지표: {total_revenue, mom_pct, yoy_pct, new_patient_count, top_channel, avg_age, ...}';
COMMENT ON COLUMN dentweb_patients.acquisition_channel IS '덴트웹 내원경로 (소개/인터넷/간판/광고/기타)';
COMMENT ON COLUMN dentweb_patients.customer_type IS '덴트웹 고객구분 (일반/VIP/직원소개 등)';
