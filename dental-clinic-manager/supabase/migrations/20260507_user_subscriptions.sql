-- ============================================
-- 개인 구독 시스템 (user_subscriptions)
-- 자동매매 모듈을 clinic → 개인 구독으로 전환하기 위한 신규 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS user_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  monthly_base_price INT NOT NULL DEFAULT 0,
  revenue_share_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES user_subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','cancelled','suspended','expired')),
  billing_key TEXT,
  card_name TEXT,
  card_number_last4 TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  migrated_from_clinic_id UUID NULL,
  migrated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

CREATE TABLE IF NOT EXISTS user_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  portone_payment_id TEXT NOT NULL,
  portone_tx_id TEXT,
  amount INT NOT NULL,
  base_amount INT NOT NULL DEFAULT 0,
  revenue_share_amount INT NOT NULL DEFAULT 0,
  realized_profit_basis INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  fail_reason TEXT,
  billing_period_start DATE,
  billing_period_end DATE,
  order_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_user_status
  ON user_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_sub_payments_user_time
  ON user_subscription_payments (user_id, created_at DESC);

-- RLS
ALTER TABLE user_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscription_payments ENABLE ROW LEVEL SECURITY;

-- 플랜은 모두 SELECT 가능, 변경은 master_admin만 (service_role 우회 필요)
CREATE POLICY "user_subscription_plans_select_all"
  ON user_subscription_plans FOR SELECT
  USING (true);

-- 본인 구독만 SELECT
CREATE POLICY "user_subscriptions_select_own"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- 본인 결제 내역만 SELECT
CREATE POLICY "user_sub_payments_select_own"
  ON user_subscription_payments FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE는 모두 service_role(API 라우트)에서만 수행 → 별도 정책 추가 안 함

-- 시드: 자동매매 플랜 (운영자가 master UI에서 가격 변경)
INSERT INTO user_subscription_plans (feature_id, display_name, monthly_base_price, revenue_share_pct, description, is_active)
VALUES (
  'investment',
  '주식 자동매매',
  9900,
  5.00,
  '월 정액 + 실현 수익의 5%. 군중심리 분석 기능 포함.',
  true
)
ON CONFLICT (feature_id) DO NOTHING;
