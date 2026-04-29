-- 사용자별 메뉴 설정 테이블
-- 한 계정에서 메뉴 구성을 변경하면 어떤 컴퓨터에서 로그인하든 동일한 메뉴 구조가 보이도록 DB에 저장

CREATE TABLE IF NOT EXISTS user_menu_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '[]'::jsonb,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT user_menu_settings_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_menu_settings_user_id ON user_menu_settings(user_id);

COMMENT ON TABLE user_menu_settings IS '사용자별 좌측 탭 메뉴 개인 설정 (계정 종속)';
COMMENT ON COLUMN user_menu_settings.user_id IS '사용자 ID (auth.users.id)';
COMMENT ON COLUMN user_menu_settings.settings IS 'MenuItemSetting[] JSON';
COMMENT ON COLUMN user_menu_settings.categories IS 'MenuCategorySetting[] JSON';

ALTER TABLE user_menu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_menu_settings_select_own" ON user_menu_settings;
CREATE POLICY "user_menu_settings_select_own" ON user_menu_settings
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_menu_settings_insert_own" ON user_menu_settings;
CREATE POLICY "user_menu_settings_insert_own" ON user_menu_settings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_menu_settings_update_own" ON user_menu_settings;
CREATE POLICY "user_menu_settings_update_own" ON user_menu_settings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_menu_settings_delete_own" ON user_menu_settings;
CREATE POLICY "user_menu_settings_delete_own" ON user_menu_settings
  FOR DELETE
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_user_menu_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_menu_settings_updated_at ON user_menu_settings;
CREATE TRIGGER user_menu_settings_updated_at
  BEFORE UPDATE ON user_menu_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_menu_settings_updated_at();
