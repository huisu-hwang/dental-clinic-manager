-- ============================================
-- 개인 구독 시스템 보강
-- - RLS 정책에 TO authenticated 추가 (프로젝트 컨벤션 정렬)
-- - portone_payment_id UNIQUE (webhook 멱등성)
-- - next_billing_date 부분 인덱스 (월말 청구 cron 지원)
-- ============================================

-- 1) RLS 정책 재생성 (TO authenticated)
DROP POLICY IF EXISTS user_subscription_plans_select_all ON user_subscription_plans;
DROP POLICY IF EXISTS user_subscriptions_select_own ON user_subscriptions;
DROP POLICY IF EXISTS user_sub_payments_select_own ON user_subscription_payments;

CREATE POLICY user_subscription_plans_select_authenticated
  ON user_subscription_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY user_subscriptions_select_own
  ON user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_sub_payments_select_own
  ON user_subscription_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2) webhook 멱등성: portone_payment_id UNIQUE
ALTER TABLE user_subscription_payments
  ADD CONSTRAINT user_subscription_payments_portone_payment_id_key
  UNIQUE (portone_payment_id);

-- 3) 월말 청구 cron 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_user_subs_billing_due
  ON user_subscriptions (next_billing_date)
  WHERE status IN ('active','past_due');
