-- ========================================
-- 소개환자 관리 시스템
-- Patient Referral Management System
-- Migration: 20260429_create_patient_referrals
-- ========================================

-- 1. patient_referrals : 소개 관계 핵심 테이블
CREATE TABLE IF NOT EXISTS patient_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  referrer_dentweb_patient_id UUID NOT NULL REFERENCES dentweb_patients(id) ON DELETE RESTRICT,
  referee_dentweb_patient_id UUID NOT NULL REFERENCES dentweb_patients(id) ON DELETE CASCADE,
  referred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  first_paid_at DATE,
  first_paid_amount NUMERIC(12,0),
  thanks_sms_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (referrer_dentweb_patient_id <> referee_dentweb_patient_id),
  UNIQUE(clinic_id, referee_dentweb_patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_clinic_referrer
  ON patient_referrals(clinic_id, referrer_dentweb_patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_referrals_clinic_referred_at
  ON patient_referrals(clinic_id, referred_at DESC);

-- 2. patient_points : 포인트 트랜잭션 (장부 방식, 단일 진실 원천)
CREATE TABLE IF NOT EXISTS patient_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  dentweb_patient_id UUID NOT NULL REFERENCES dentweb_patients(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'referral_reward',  -- 소개해주신 분 적립
    'referral_welcome', -- 신환 환영 적립
    'manual_add',
    'manual_use',
    'expired'
  )),
  referral_id UUID REFERENCES patient_referrals(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_points_clinic_patient
  ON patient_points(clinic_id, dentweb_patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_points_referral
  ON patient_points(referral_id) WHERE referral_id IS NOT NULL;

-- 3. patient_families / patient_family_members : 가족관계 묶음 (Phase 2)
CREATE TABLE IF NOT EXISTS patient_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  family_name TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_family_members (
  family_id UUID NOT NULL REFERENCES patient_families(id) ON DELETE CASCADE,
  dentweb_patient_id UUID NOT NULL REFERENCES dentweb_patients(id) ON DELETE CASCADE,
  relation_label TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (family_id, dentweb_patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_families_clinic ON patient_families(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_family_members_patient
  ON patient_family_members(dentweb_patient_id);

-- 4. referral_sms_logs : 감사 문자 발송 이력
CREATE TABLE IF NOT EXISTS referral_sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES patient_referrals(id) ON DELETE SET NULL,
  recipient_dentweb_patient_id UUID NOT NULL REFERENCES dentweb_patients(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN ('SMS','LMS','MMS')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')) DEFAULT 'sent',
  aligo_msg_id TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_sms_logs_clinic_sent
  ON referral_sms_logs(clinic_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_sms_logs_referral
  ON referral_sms_logs(referral_id);

-- 5. referral_settings : 병원별 소개 정책 (포인트 기본값 등)
CREATE TABLE IF NOT EXISTS referral_settings (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  referrer_default_points INTEGER NOT NULL DEFAULT 5000,
  referee_default_points INTEGER NOT NULL DEFAULT 3000,
  auto_thanks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_thanks_after_days INTEGER NOT NULL DEFAULT 0,
  thanks_template_id UUID REFERENCES recall_sms_templates(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. gift_logs 확장 : 소개 환자/카테고리/소개관계 연결 컬럼
ALTER TABLE gift_logs
  ADD COLUMN IF NOT EXISTS dentweb_patient_id UUID REFERENCES dentweb_patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES gift_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES patient_referrals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gift_logs_dentweb_patient
  ON gift_logs(clinic_id, dentweb_patient_id) WHERE dentweb_patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gift_logs_referral
  ON gift_logs(referral_id) WHERE referral_id IS NOT NULL;

-- 7. user_notifications.type CHECK 확장 (referral_new_added 추가)
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type = ANY (ARRAY[
    'leave_approval_pending', 'leave_approved', 'leave_rejected', 'leave_forwarded',
    'contract_signature_required', 'contract_signed', 'contract_completed', 'contract_cancelled',
    'document_resignation', 'document_approved', 'document_rejected', 'document',
    'telegram_board_approved', 'telegram_board_rejected', 'telegram_board_pending',
    'task_assigned', 'task_completed',
    'protocol_review_requested', 'protocol_review_approved', 'protocol_review_rejected',
    'subscription_upgrade_required', 'subscription_payment_succeeded',
    'important', 'system', 'monthly_report_ready',
    'referral_new_added'
  ]));

-- 8. patient_point_balance VIEW : 환자별 포인트 잔액 (단일 진실 원천)
CREATE OR REPLACE VIEW patient_point_balance AS
SELECT
  clinic_id,
  dentweb_patient_id,
  COALESCE(SUM(delta), 0)::INTEGER AS balance,
  MAX(created_at) AS last_transaction_at
FROM patient_points
GROUP BY clinic_id, dentweb_patient_id;

-- 9. RLS 정책
ALTER TABLE patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_settings ENABLE ROW LEVEL SECURITY;

-- patient_referrals
CREATE POLICY "clinic users can view referrals" ON patient_referrals FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can insert referrals" ON patient_referrals FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can update referrals" ON patient_referrals FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can delete referrals" ON patient_referrals FOR DELETE
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- patient_points
CREATE POLICY "clinic users can view points" ON patient_points FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can insert points" ON patient_points FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- patient_families
CREATE POLICY "clinic users can view families" ON patient_families FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can manage families" ON patient_families FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- patient_family_members
CREATE POLICY "clinic users can view family members" ON patient_family_members FOR SELECT
  USING (family_id IN (SELECT id FROM patient_families WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())));
CREATE POLICY "clinic users can manage family members" ON patient_family_members FOR ALL
  USING (family_id IN (SELECT id FROM patient_families WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())))
  WITH CHECK (family_id IN (SELECT id FROM patient_families WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())));

-- referral_sms_logs
CREATE POLICY "clinic users can view referral sms logs" ON referral_sms_logs FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can insert referral sms logs" ON referral_sms_logs FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- referral_settings
CREATE POLICY "clinic users can view referral settings" ON referral_settings FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "clinic users can manage referral settings" ON referral_settings FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- 10. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_referral_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_referrals_updated_at ON patient_referrals;
CREATE TRIGGER trg_patient_referrals_updated_at BEFORE UPDATE ON patient_referrals
  FOR EACH ROW EXECUTE FUNCTION set_referral_updated_at();

DROP TRIGGER IF EXISTS trg_patient_families_updated_at ON patient_families;
CREATE TRIGGER trg_patient_families_updated_at BEFORE UPDATE ON patient_families
  FOR EACH ROW EXECUTE FUNCTION set_referral_updated_at();

DROP TRIGGER IF EXISTS trg_referral_settings_updated_at ON referral_settings;
CREATE TRIGGER trg_referral_settings_updated_at BEFORE UPDATE ON referral_settings
  FOR EACH ROW EXECUTE FUNCTION set_referral_updated_at();

-- 11. 기존 모든 병원에 referral_settings 기본값 시드
INSERT INTO referral_settings (clinic_id)
SELECT id FROM clinics
WHERE NOT EXISTS (SELECT 1 FROM referral_settings WHERE clinic_id = clinics.id);

-- 12. 새 병원 생성 시 referral_settings 자동 생성 트리거
CREATE OR REPLACE FUNCTION create_default_referral_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO referral_settings (clinic_id) VALUES (NEW.id)
  ON CONFLICT (clinic_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_referral_settings ON clinics;
CREATE TRIGGER trg_create_referral_settings AFTER INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION create_default_referral_settings();

-- 13. gift_categories 시드 : 소개 감사 / 소개 환영
INSERT INTO gift_categories (clinic_id, name, description, color, display_order)
SELECT c.id, '소개 감사 선물', '환자를 소개해주신 분께 드리는 감사 선물', '#1b61c9', 4
FROM clinics c
WHERE NOT EXISTS (SELECT 1 FROM gift_categories gc WHERE gc.clinic_id = c.id AND gc.name = '소개 감사 선물')
ON CONFLICT (clinic_id, name) DO NOTHING;

INSERT INTO gift_categories (clinic_id, name, description, color, display_order)
SELECT c.id, '소개 환영 선물', '소개로 오신 신환에게 드리는 환영 선물', '#6b3fa0', 5
FROM clinics c
WHERE NOT EXISTS (SELECT 1 FROM gift_categories gc WHERE gc.clinic_id = c.id AND gc.name = '소개 환영 선물')
ON CONFLICT (clinic_id, name) DO NOTHING;

-- 14. recall_sms_templates 시드 : 소개 감사 기본 템플릿 (병원별)
INSERT INTO recall_sms_templates (clinic_id, name, content, is_default, is_active)
SELECT c.id,
       '소개 감사 인사',
       '안녕하세요, ' || c.name || '입니다. {{환자명}}님 덕분에 {{소개받은신환명}}님을 모실 수 있게 되어 진심으로 감사드립니다. 소중한 추천에 보답하고자 작은 마음을 준비했습니다. 늘 건강하시기 바랍니다.',
       false,
       true
FROM clinics c
WHERE NOT EXISTS (
  SELECT 1 FROM recall_sms_templates t WHERE t.clinic_id = c.id AND t.name = '소개 감사 인사'
);

-- ========================================
-- Migration Complete
-- ========================================
