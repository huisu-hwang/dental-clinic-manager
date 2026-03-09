-- ========================================
-- 덴트웹 데이터베이스 연동 테이블
-- DentWeb Database Integration Tables
-- ========================================

-- 1. 동기화 설정 테이블
CREATE TABLE IF NOT EXISTS dentweb_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT false,
  sync_interval_seconds INTEGER DEFAULT 300,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error')),
  last_sync_error TEXT,
  last_sync_patient_count INTEGER DEFAULT 0,
  api_key TEXT,
  agent_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id)
);

-- 2. 덴트웹 환자 데이터 테이블
CREATE TABLE IF NOT EXISTS dentweb_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  dentweb_patient_id TEXT NOT NULL,
  chart_number TEXT,
  patient_name TEXT NOT NULL,
  phone_number TEXT,
  birth_date DATE,
  gender TEXT,
  last_visit_date DATE,
  last_treatment_type TEXT,
  next_appointment_date DATE,
  registration_date DATE,
  is_active BOOLEAN DEFAULT true,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, dentweb_patient_id)
);

-- 3. 동기화 이력 테이블
CREATE TABLE IF NOT EXISTS dentweb_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'error')),
  total_records INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_dentweb_patients_clinic_id ON dentweb_patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dentweb_patients_chart_number ON dentweb_patients(clinic_id, chart_number);
CREATE INDEX IF NOT EXISTS idx_dentweb_patients_phone ON dentweb_patients(clinic_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_dentweb_patients_last_visit ON dentweb_patients(clinic_id, last_visit_date);
CREATE INDEX IF NOT EXISTS idx_dentweb_patients_name ON dentweb_patients(clinic_id, patient_name);
CREATE INDEX IF NOT EXISTS idx_dentweb_sync_logs_clinic ON dentweb_sync_logs(clinic_id, started_at DESC);

-- RLS 정책
ALTER TABLE dentweb_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentweb_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentweb_sync_logs ENABLE ROW LEVEL SECURITY;

-- dentweb_sync_config RLS
CREATE POLICY "Users can view own clinic sync config"
  ON dentweb_sync_config FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert own clinic sync config"
  ON dentweb_sync_config FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update own clinic sync config"
  ON dentweb_sync_config FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- dentweb_patients RLS
CREATE POLICY "Users can view own clinic dentweb patients"
  ON dentweb_patients FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Service role can manage dentweb patients"
  ON dentweb_patients FOR ALL
  USING (true)
  WITH CHECK (true);

-- dentweb_sync_logs RLS
CREATE POLICY "Users can view own clinic sync logs"
  ON dentweb_sync_logs FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Service role can manage sync logs"
  ON dentweb_sync_logs FOR ALL
  USING (true)
  WITH CHECK (true);
