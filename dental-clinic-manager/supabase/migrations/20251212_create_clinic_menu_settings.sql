-- 병원별 메뉴 설정 테이블
-- 대표 원장이 좌측 탭 메뉴의 표시 여부와 순서를 설정할 수 있도록 함

-- 테이블 생성
CREATE TABLE IF NOT EXISTS clinic_menu_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT clinic_menu_settings_clinic_id_unique UNIQUE (clinic_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_clinic_menu_settings_clinic_id ON clinic_menu_settings(clinic_id);

-- 코멘트 추가
COMMENT ON TABLE clinic_menu_settings IS '병원별 메뉴 설정';
COMMENT ON COLUMN clinic_menu_settings.id IS '고유 식별자';
COMMENT ON COLUMN clinic_menu_settings.clinic_id IS '병원 ID';
COMMENT ON COLUMN clinic_menu_settings.settings IS '메뉴 설정 JSON 배열';
COMMENT ON COLUMN clinic_menu_settings.created_at IS '생성 일시';
COMMENT ON COLUMN clinic_menu_settings.updated_at IS '수정 일시';

-- RLS 활성화
ALTER TABLE clinic_menu_settings ENABLE ROW LEVEL SECURITY;

-- 정책: 같은 병원 소속 사용자는 메뉴 설정을 조회할 수 있음
CREATE POLICY "clinic_menu_settings_select_policy" ON clinic_menu_settings
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 정책: 대표 원장(owner)만 메뉴 설정을 생성할 수 있음
CREATE POLICY "clinic_menu_settings_insert_policy" ON clinic_menu_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = clinic_menu_settings.clinic_id
        AND role = 'owner'
    )
  );

-- 정책: 대표 원장(owner)만 메뉴 설정을 수정할 수 있음
CREATE POLICY "clinic_menu_settings_update_policy" ON clinic_menu_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = clinic_menu_settings.clinic_id
        AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = clinic_menu_settings.clinic_id
        AND role = 'owner'
    )
  );

-- 정책: 대표 원장(owner)만 메뉴 설정을 삭제할 수 있음
CREATE POLICY "clinic_menu_settings_delete_policy" ON clinic_menu_settings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = clinic_menu_settings.clinic_id
        AND role = 'owner'
    )
  );

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_clinic_menu_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS clinic_menu_settings_updated_at ON clinic_menu_settings;
CREATE TRIGGER clinic_menu_settings_updated_at
  BEFORE UPDATE ON clinic_menu_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_menu_settings_updated_at();
