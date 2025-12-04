-- 사용자 활동 기록 테이블 생성
-- User Activity Logs Table for tracking user activities

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  activity_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'page_view', 'action'
  activity_description TEXT NOT NULL,
  ip_address VARCHAR(45), -- IPv4 or IPv6
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_clinic_id ON user_activity_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_created ON user_activity_logs(user_id, created_at DESC);

-- RLS (Row Level Security) Policies
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Master admin can read all activity logs
CREATE POLICY "Master admin can read all activity logs"
  ON user_activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'master_admin'
    )
  );

-- Clinic owner can read activity logs of their clinic members
CREATE POLICY "Clinic owner can read clinic activity logs"
  ON user_activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
      AND users.clinic_id = user_activity_logs.clinic_id
    )
  );

-- Users can read their own activity logs
CREATE POLICY "Users can read own activity logs"
  ON user_activity_logs FOR SELECT
  USING (user_id = auth.uid());

-- Service role can insert activity logs (for API)
CREATE POLICY "Service role can insert activity logs"
  ON user_activity_logs FOR INSERT
  WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE user_activity_logs IS '사용자 활동 기록 테이블 - 로그인, 로그아웃, 페이지 조회 등의 활동을 기록';
COMMENT ON COLUMN user_activity_logs.activity_type IS '활동 유형: login, logout, page_view, action';
COMMENT ON COLUMN user_activity_logs.metadata IS '추가 메타데이터 (JSON 형식)';
