-- ============================================
-- 클리닉별 프리미엄 기능 접근 제어 테이블
-- 마스터 관리자가 선택한 클리닉에만 프리미엄 기능 허용
-- ============================================

CREATE TABLE clinic_premium_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,  -- 'ai-analysis' | 'financial' | 'marketing'
  enabled BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = 영구
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clinic_id, feature_id)
);

-- 인덱스
CREATE INDEX idx_clinic_premium_features_clinic_id ON clinic_premium_features(clinic_id);
CREATE INDEX idx_clinic_premium_features_feature_id ON clinic_premium_features(feature_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_clinic_premium_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_clinic_premium_features_updated_at
  BEFORE UPDATE ON clinic_premium_features
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_premium_features_updated_at();

-- RLS 활성화
ALTER TABLE clinic_premium_features ENABLE ROW LEVEL SECURITY;

-- master_admin 전체 접근
CREATE POLICY "master_admin_all_access" ON clinic_premium_features
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  );

-- 일반 사용자: 자기 클리닉의 프리미엄 기능만 읽기
CREATE POLICY "clinic_members_read_own" ON clinic_premium_features
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );
