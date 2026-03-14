-- ============================================
-- 홈택스 세션 저장 테이블 (Protocol 모드 세션 재사용)
-- ============================================
CREATE TABLE IF NOT EXISTS hometax_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  cookies JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_hometax_sessions_clinic ON hometax_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_hometax_sessions_expires ON hometax_sessions(expires_at);

ALTER TABLE hometax_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage hometax_sessions"
  ON hometax_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 알림 테이블 (앱 내 알림)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic ON notifications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(clinic_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own clinic notifications"
  ON notifications
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage notifications"
  ON notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);
