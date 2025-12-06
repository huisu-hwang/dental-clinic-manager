-- 알림 해제 기능 동기화를 위한 dismissed_at 필드 추가
-- 한 사용자가 알림을 해제하면 모든 사용자에게 동일하게 적용됨

-- dismissed_at: 해제된 날짜 (DATE 타입으로 오늘 날짜와 비교하여 해제 여부 판단)
-- dismissed_by: 해제한 사용자 ID
ALTER TABLE clinic_notifications
ADD COLUMN IF NOT EXISTS dismissed_at DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dismissed_by UUID DEFAULT NULL REFERENCES users(id);

-- 인덱스 추가 (해제된 알림 필터링 성능 향상)
CREATE INDEX IF NOT EXISTS idx_clinic_notifications_dismissed_at
ON clinic_notifications(clinic_id, dismissed_at);

-- 코멘트 추가
COMMENT ON COLUMN clinic_notifications.dismissed_at IS '알림이 해제된 날짜 (오늘 날짜와 비교하여 필터링)';
COMMENT ON COLUMN clinic_notifications.dismissed_by IS '알림을 해제한 사용자 ID';
