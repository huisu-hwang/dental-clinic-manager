-- 구독 관련 사용자 알림 타입 추가 + metadata JSONB 컬럼 추가
-- 2026-04-19

-- 1. type CHECK 제약조건 갱신 — subscription_upgrade_required, subscription_payment_succeeded 포함
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
    'important', 'system'
  ]));

-- 2. metadata JSONB 컬럼 추가 — 알림 타입별 부가 페이로드 저장
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN user_notifications.metadata IS '타입별 부가 페이로드. 예: subscription_payment_succeeded의 { pendingCount, newLimit, newPlanName }';
