-- 제외 환자 규칙 테이블 (미매칭 환자 저장용)
-- 추후 환자 업로드 시 자동 매칭하여 제외 처리
CREATE TABLE recall_exclude_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_name TEXT,
  phone_number TEXT,
  chart_number TEXT,
  exclude_reason TEXT NOT NULL DEFAULT 'family',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  matched_patient_id UUID REFERENCES recall_patients(id) ON DELETE SET NULL,
  CONSTRAINT at_least_one_field CHECK (
    patient_name IS NOT NULL OR phone_number IS NOT NULL OR chart_number IS NOT NULL
  )
);

-- 인덱스
CREATE INDEX idx_exclude_rules_clinic_active ON recall_exclude_rules(clinic_id) WHERE is_active = true;
CREATE INDEX idx_exclude_rules_phone ON recall_exclude_rules(phone_number) WHERE phone_number IS NOT NULL AND is_active = true;
CREATE INDEX idx_exclude_rules_name ON recall_exclude_rules(patient_name) WHERE patient_name IS NOT NULL AND is_active = true;
CREATE INDEX idx_exclude_rules_chart ON recall_exclude_rules(chart_number) WHERE chart_number IS NOT NULL AND is_active = true;

-- RLS 활성화
ALTER TABLE recall_exclude_rules ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 인증된 사용자만 접근
CREATE POLICY "recall_exclude_rules_select" ON recall_exclude_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "recall_exclude_rules_insert" ON recall_exclude_rules
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recall_exclude_rules_update" ON recall_exclude_rules
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recall_exclude_rules_delete" ON recall_exclude_rules
  FOR DELETE TO authenticated USING (true);
