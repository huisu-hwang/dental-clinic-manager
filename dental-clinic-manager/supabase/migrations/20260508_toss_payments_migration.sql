-- ============================================
-- 토스페이먼츠 직결 마이그레이션
-- Migration: 20260508_toss_payments_migration.sql
-- Created: 2026-05-08
--
-- 목적:
--   - 포트원(PortOne) 의존 컬럼 제거 후 토스페이먼츠 직결 컬럼으로 전환
--   - subscriptions / subscription_payments / user_subscriptions / user_subscription_payments 4개 테이블 변환
--   - 신규 billing_webhook_events 테이블 생성 (웹훅 멱등 + 감사 로그)
--   - user_notifications type CHECK에 결제 실패/경고/정지 3종 추가
--
-- 전제: 운영 데이터 0건 (DO $$ 가드로 강제)
-- 적용: Supabase MCP `apply_migration` 또는 psql
-- ============================================

BEGIN;

-- ============================================
-- 0. 운영 데이터 0건 검증 가드 (있으면 abort)
-- ============================================
DO $$
DECLARE
  cnt INTEGER;
BEGIN
  -- subscriptions / user_subscriptions: customer_key SET NOT NULL이 기존 행에서 실패하므로 0행 강제
  SELECT COUNT(*) INTO cnt FROM subscriptions;
  IF cnt > 0 THEN
    RAISE EXCEPTION '[abort] subscriptions has % rows; toss migration assumes 0 operational rows (customer_key NOT NULL constraint would fail). Clear data before proceeding.', cnt;
  END IF;

  SELECT COUNT(*) INTO cnt FROM user_subscriptions;
  IF cnt > 0 THEN
    RAISE EXCEPTION '[abort] user_subscriptions has % rows; toss migration assumes 0 operational rows (customer_key NOT NULL constraint would fail). Clear data before proceeding.', cnt;
  END IF;

  SELECT COUNT(*) INTO cnt FROM subscription_payments;
  IF cnt > 0 THEN
    RAISE EXCEPTION '[abort] subscription_payments has % rows; toss migration assumes 0 operational rows. Clear data before proceeding.', cnt;
  END IF;

  SELECT COUNT(*) INTO cnt FROM user_subscription_payments;
  IF cnt > 0 THEN
    RAISE EXCEPTION '[abort] user_subscription_payments has % rows; toss migration assumes 0 operational rows. Clear data before proceeding.', cnt;
  END IF;
END $$;

-- ============================================
-- 1. subscriptions (클리닉 구독)
--    - card_name / card_number_last4 제거
--    - 토스용 customer_key / card_company / billing_method 추가
--    - status CHECK에 'pending' 추가
-- ============================================
ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS card_name CASCADE,
  DROP COLUMN IF EXISTS card_number_last4 CASCADE,
  ADD COLUMN IF NOT EXISTS customer_key TEXT,
  ADD COLUMN IF NOT EXISTS card_company VARCHAR(50),
  ADD COLUMN IF NOT EXISTS billing_method VARCHAR(20) DEFAULT 'card';

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending','trialing','active','past_due','cancelled','suspended','expired'));

-- customer_key는 NOT NULL UNIQUE (운영 데이터 0건 전제)
ALTER TABLE subscriptions ALTER COLUMN customer_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_customer_key
  ON subscriptions (customer_key);

-- ============================================
-- 2. subscription_payments (클리닉 결제)
--    - portone_payment_id / portone_tx_id 제거 (UNIQUE 제약 동시 제거 위해 CASCADE)
--    - 토스용 토큰/응답 컬럼 추가
-- ============================================
ALTER TABLE subscription_payments
  DROP COLUMN IF EXISTS portone_payment_id CASCADE,
  DROP COLUMN IF EXISTS portone_tx_id CASCADE,
  ADD COLUMN IF NOT EXISTS toss_payment_key TEXT,
  ADD COLUMN IF NOT EXISTS toss_order_id TEXT,
  ADD COLUMN IF NOT EXISTS toss_secret TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS raw_response JSONB;

ALTER TABLE subscription_payments ALTER COLUMN toss_order_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_order_id
  ON subscription_payments (toss_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_payment_key
  ON subscription_payments (toss_payment_key)
  WHERE toss_payment_key IS NOT NULL;

-- ============================================
-- 3. user_subscriptions (개인 투자 구독)
--    - card_name / card_number_last4 제거
--    - 토스용 customer_key / card_company / billing_method 추가
--    - status CHECK에 'pending' 추가
-- ============================================
ALTER TABLE user_subscriptions
  DROP COLUMN IF EXISTS card_name CASCADE,
  DROP COLUMN IF EXISTS card_number_last4 CASCADE,
  ADD COLUMN IF NOT EXISTS customer_key TEXT,
  ADD COLUMN IF NOT EXISTS card_company VARCHAR(50),
  ADD COLUMN IF NOT EXISTS billing_method VARCHAR(20) DEFAULT 'card';

ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('pending','active','past_due','cancelled','suspended','expired'));

ALTER TABLE user_subscriptions ALTER COLUMN customer_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_customer_key
  ON user_subscriptions (customer_key);

-- ============================================
-- 4. user_subscription_payments (개인 투자 결제)
--    - portone_payment_id / portone_tx_id 제거 (UNIQUE 제약 동시 제거)
--    - 토스용 토큰/응답 컬럼 추가
-- ============================================
ALTER TABLE user_subscription_payments
  DROP COLUMN IF EXISTS portone_payment_id CASCADE,
  DROP COLUMN IF EXISTS portone_tx_id CASCADE,
  ADD COLUMN IF NOT EXISTS toss_payment_key TEXT,
  ADD COLUMN IF NOT EXISTS toss_order_id TEXT,
  ADD COLUMN IF NOT EXISTS toss_secret TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS raw_response JSONB;

ALTER TABLE user_subscription_payments ALTER COLUMN toss_order_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscription_payments_order_id
  ON user_subscription_payments (toss_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscription_payments_payment_key
  ON user_subscription_payments (toss_payment_key)
  WHERE toss_payment_key IS NOT NULL;

-- ============================================
-- 5. 신규: billing_webhook_events (웹훅 멱등 + 감사 로그)
-- ============================================
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  payment_key TEXT,
  order_id TEXT,
  status TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  process_error TEXT,
  UNIQUE (event_type, payment_key, status)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_unprocessed
  ON billing_webhook_events (received_at)
  WHERE processed_at IS NULL;

-- RLS: master_admin만 조회 가능
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master admin can read webhook events" ON billing_webhook_events;
CREATE POLICY "Master admin can read webhook events"
  ON billing_webhook_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  );

-- ============================================
-- 6. user_notifications type CHECK 갱신
--    기존 (20260419 + 20260501 monthly_report_ready) 모두 보존 + 신규 3종 추가
-- ============================================
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type = ANY (ARRAY[
    -- 기존 (preserve from 20260419_user_notifications_subscription_types.sql)
    'leave_approval_pending', 'leave_approved', 'leave_rejected', 'leave_forwarded',
    'contract_signature_required', 'contract_signed', 'contract_completed', 'contract_cancelled',
    'document_resignation', 'document_approved', 'document_rejected', 'document',
    'telegram_board_approved', 'telegram_board_rejected', 'telegram_board_pending',
    'task_assigned', 'task_completed',
    'protocol_review_requested', 'protocol_review_approved', 'protocol_review_rejected',
    'subscription_upgrade_required', 'subscription_payment_succeeded',
    'important', 'system',
    -- 추가 (preserve from 20260501_add_monthly_report_notification_type.sql)
    'monthly_report_ready',
    -- 추가 (preserve from 20260429_create_patient_referrals.sql)
    'referral_new_added',
    -- 신규 (this migration)
    'subscription_payment_failed',
    'subscription_payment_warning',
    'subscription_suspended'
  ]));

COMMIT;

-- ============================================
-- 적용 후 검증 쿼리
-- ============================================
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name IN ('subscriptions','subscription_payments','user_subscriptions','user_subscription_payments','billing_webhook_events')
--  ORDER BY table_name, ordinal_position;
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'user_notifications'::regclass AND contype = 'c';
-- ============================================
