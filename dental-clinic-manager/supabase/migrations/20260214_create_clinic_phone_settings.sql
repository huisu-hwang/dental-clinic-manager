-- ============================================
-- 병원 전화 다이얼 설정 테이블 생성
-- Migration: 20260214_create_clinic_phone_settings.sql
-- Created: 2026-02-14
--
-- 목적: 전화 다이얼 설정을 병원 단위로 DB에 저장하여
--       같은 병원의 모든 사용자가 자동으로 설정을 공유
-- ============================================

CREATE TABLE IF NOT EXISTS clinic_phone_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{
    "protocol": "tel",
    "numberFormat": {
      "removeSpecialChars": true
    }
  }'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_clinic_phone_settings_clinic_id ON clinic_phone_settings(clinic_id);

-- RLS 활성화
ALTER TABLE clinic_phone_settings ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 병원 사용자는 조회 가능
CREATE POLICY "clinic_phone_settings_select"
  ON clinic_phone_settings
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- RLS 정책: 같은 병원의 owner/manager만 수정 가능
CREATE POLICY "clinic_phone_settings_insert"
  ON clinic_phone_settings
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY "clinic_phone_settings_update"
  ON clinic_phone_settings
  FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_clinic_phone_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_clinic_phone_settings_timestamp
  BEFORE UPDATE ON clinic_phone_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_phone_settings_timestamp();

-- ============================================
-- Migration Complete
-- ============================================
