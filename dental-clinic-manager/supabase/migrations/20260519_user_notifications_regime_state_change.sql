-- ============================================
-- user_notifications.type CHECK 에 regime_state_change 추가
-- Created: 2026-05-19
--
-- Phase 3-E (시장 국면 전환 알림): train_worker 가 이전 regime_run 과 비교하여
-- state 가 바뀐 경우 owner/vice_director/manager 사용자에게 알림 발송
-- ============================================

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
  'important', 'system',
  'monthly_report_ready',
  'referral_new_added',
  'subscription_payment_failed', 'subscription_payment_warning', 'subscription_suspended',
  'group_join_requested', 'group_join_approved', 'group_join_rejected',
  'regime_state_change'
]::text[]));
