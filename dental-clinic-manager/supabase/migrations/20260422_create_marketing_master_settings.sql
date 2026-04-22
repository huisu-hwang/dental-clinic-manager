-- ============================================
-- 마스터 전역 설정 테이블 (key-value)
-- - 이미지 생성 모델 선택 등 전역 스위치 저장
-- ============================================

CREATE TABLE IF NOT EXISTS marketing_master_settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

COMMENT ON TABLE marketing_master_settings IS '마케팅 전역 설정 (마스터 전용 key-value 스토어)';

-- RLS: 읽기는 모든 로그인 사용자 허용, 쓰기는 master_admin만 허용
ALTER TABLE marketing_master_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_master_settings_read" ON marketing_master_settings;
CREATE POLICY "marketing_master_settings_read" ON marketing_master_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "marketing_master_settings_write" ON marketing_master_settings;
CREATE POLICY "marketing_master_settings_write" ON marketing_master_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  );

-- 기본값 시드: 이미지 생성 모델 = gemini (기존 동작 유지)
INSERT INTO marketing_master_settings (key, value)
VALUES ('image_provider', 'gemini')
ON CONFLICT (key) DO NOTHING;
