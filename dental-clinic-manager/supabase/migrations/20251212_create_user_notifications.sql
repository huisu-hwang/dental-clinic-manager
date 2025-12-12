-- 사용자별 알림 테이블 생성 (연차 승인, 계약서 서명 등)
-- 2025-12-12

-- user_notifications 테이블 생성
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'leave_approval_pending',
    'leave_approved',
    'leave_rejected',
    'leave_forwarded',
    'contract_signature_required',
    'contract_signed',
    'contract_completed',
    'contract_cancelled',
    'system'
  )),
  title TEXT NOT NULL,
  content TEXT,
  link TEXT,
  reference_type TEXT, -- 'leave_request', 'contract' 등
  reference_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_clinic_id ON user_notifications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_reference ON user_notifications(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_type ON user_notifications(type);

-- RLS 활성화
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 알림만 조회 가능
CREATE POLICY "Users can view own notifications"
  ON user_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 정책: 같은 clinic의 사용자가 알림 생성 가능 (서버 사이드에서 추가 검증)
CREATE POLICY "Users can create notifications for clinic members"
  ON user_notifications FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- RLS 정책: 본인 알림만 업데이트 가능 (읽음 처리)
CREATE POLICY "Users can update own notifications"
  ON user_notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS 정책: 본인 알림만 삭제 가능
CREATE POLICY "Users can delete own notifications"
  ON user_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 알림 생성 함수 (서버에서 호출)
CREATE OR REPLACE FUNCTION create_user_notification(
  p_clinic_id UUID,
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_content TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO user_notifications (
    clinic_id,
    user_id,
    type,
    title,
    content,
    link,
    reference_type,
    reference_id,
    created_by,
    expires_at
  ) VALUES (
    p_clinic_id,
    p_user_id,
    p_type,
    p_title,
    p_content,
    p_link,
    p_reference_type,
    p_reference_id,
    p_created_by,
    p_expires_at
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 읽지 않은 알림 개수 조회 함수
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM user_notifications
  WHERE user_id = p_user_id
    AND is_read = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());

  RETURN v_count;
END;
$$;

-- 알림 읽음 처리 함수
CREATE OR REPLACE FUNCTION mark_notification_as_read(p_notification_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- 모든 알림 읽음 처리 함수
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE user_notifications
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id AND is_read = FALSE
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

-- 만료된 알림 삭제 함수 (스케줄러로 주기적 실행)
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM user_notifications
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

-- 코멘트 추가
COMMENT ON TABLE user_notifications IS '사용자별 개인 알림 (연차 승인, 계약서 서명 등)';
COMMENT ON COLUMN user_notifications.type IS '알림 타입: leave_approval_pending, leave_approved, leave_rejected, leave_forwarded, contract_signature_required, contract_signed, contract_completed, contract_cancelled, system';
COMMENT ON COLUMN user_notifications.reference_type IS '참조 타입: leave_request, contract 등';
COMMENT ON COLUMN user_notifications.reference_id IS '참조 레코드 ID';
