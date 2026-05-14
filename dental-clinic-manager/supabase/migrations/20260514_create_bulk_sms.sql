-- ============================================
-- 단체 문자 발송 기능 테이블 생성
-- Migration: 20260514_create_bulk_sms.sql
-- ============================================

-- 1) 캠페인
CREATE TABLE IF NOT EXISTS bulk_sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT,
  message TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'SMS'
    CHECK (msg_type IN ('SMS','LMS')),
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  filter_snapshot JSONB,
  exclude_recall_excluded BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_sms_campaigns_clinic_status
  ON bulk_sms_campaigns(clinic_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bulk_sms_campaigns_clinic_created
  ON bulk_sms_campaigns(clinic_id, created_at DESC);

-- 2) 수신자별 발송 결과
CREATE TABLE IF NOT EXISTS bulk_sms_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bulk_sms_campaigns(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  dentweb_patient_id UUID REFERENCES dentweb_patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  phone_number TEXT NOT NULL,
  personalized_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed')),
  aligo_msg_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_sms_recipients_campaign
  ON bulk_sms_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bulk_sms_recipients_dentweb_patient
  ON bulk_sms_recipients(dentweb_patient_id) WHERE dentweb_patient_id IS NOT NULL;

-- 3) 템플릿
CREATE TABLE IF NOT EXISTS bulk_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_sms_templates_clinic
  ON bulk_sms_templates(clinic_id);

-- RLS
ALTER TABLE bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_sms_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_sms_campaigns_select" ON bulk_sms_campaigns
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bulk_sms_campaigns_service_all" ON bulk_sms_campaigns
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "bulk_sms_recipients_select" ON bulk_sms_recipients
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bulk_sms_recipients_service_all" ON bulk_sms_recipients
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "bulk_sms_templates_select" ON bulk_sms_templates
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bulk_sms_templates_service_all" ON bulk_sms_templates
  FOR ALL USING (true) WITH CHECK (true);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_bulk_sms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bulk_sms_campaigns_updated_at
  BEFORE UPDATE ON bulk_sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_bulk_sms_updated_at();

CREATE TRIGGER trigger_bulk_sms_templates_updated_at
  BEFORE UPDATE ON bulk_sms_templates
  FOR EACH ROW EXECUTE FUNCTION update_bulk_sms_updated_at();
