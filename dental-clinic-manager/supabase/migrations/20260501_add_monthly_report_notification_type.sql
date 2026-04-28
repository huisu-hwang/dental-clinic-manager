-- user_notifications.type CHECK 제약에 monthly_report_ready 추가
-- Migration: 20260501_add_monthly_report_notification_type.sql
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
CHECK (type = ANY (ARRAY[
  'leave_approval_pending'::text,
  'leave_approved'::text,
  'leave_rejected'::text,
  'leave_forwarded'::text,
  'contract_signature_required'::text,
  'contract_signed'::text,
  'contract_completed'::text,
  'contract_cancelled'::text,
  'document_resignation'::text,
  'document_approved'::text,
  'document_rejected'::text,
  'document'::text,
  'telegram_board_approved'::text,
  'telegram_board_rejected'::text,
  'telegram_board_pending'::text,
  'task_assigned'::text,
  'task_completed'::text,
  'protocol_review_requested'::text,
  'protocol_review_approved'::text,
  'protocol_review_rejected'::text,
  'subscription_upgrade_required'::text,
  'subscription_payment_succeeded'::text,
  'important'::text,
  'system'::text,
  'monthly_report_ready'::text
]));
