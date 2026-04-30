-- ============================================
-- 구독 결제 시스템 마이그레이션
-- Migration: 20260418_subscription_system.sql
-- Created: 2026-04-18
-- 주의: 기존 payments 테이블은 진료비 결제용이므로
--       구독 결제는 subscription_payments 테이블로 분리
-- ============================================

-- 1. 구독 플랜 테이블
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('headcount', 'feature')),
  feature_id TEXT,
  min_users INTEGER DEFAULT 0,
  max_users INTEGER DEFAULT 999,
  price INTEGER NOT NULL DEFAULT 0,
  annual_price INTEGER,
  description TEXT,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 구독 상태 테이블
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'suspended', 'expired')),
  billing_key TEXT,
  card_name VARCHAR(100),
  card_number_last4 VARCHAR(4),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 구독 결제 내역 테이블 (진료비 payments 테이블과 분리)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  portone_payment_id VARCHAR(200) UNIQUE NOT NULL,
  portone_tx_id VARCHAR(200),
  amount INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  order_name TEXT,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  fail_reason TEXT,
  tax_invoice_num VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic_id ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing
  ON subscriptions(next_billing_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sub_payments_clinic_id ON subscription_payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_subscription_id ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON subscription_payments(status);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_type ON subscription_plans(type);

-- 5. RLS 활성화
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- 6. subscription_plans RLS 정책
DROP POLICY IF EXISTS "Anyone can read active plans" ON subscription_plans;
CREATE POLICY "Anyone can read active plans"
  ON subscription_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 7. subscriptions RLS 정책
DROP POLICY IF EXISTS "Clinic members can read own subscriptions" ON subscriptions;
CREATE POLICY "Clinic members can read own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 8. subscription_payments RLS 정책
DROP POLICY IF EXISTS "Clinic members can read own subscription payments" ON subscription_payments;
CREATE POLICY "Clinic members can read own subscription payments"
  ON subscription_payments FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 9. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- 10. 기본 헤드카운트 플랜 데이터
INSERT INTO subscription_plans (name, display_name, type, min_users, max_users, price, description, features, sort_order) VALUES
  ('free', 'Free', 'headcount', 0, 5, 0,
   '5인 이하 사업장 무료',
   '["기본 대시보드", "직원 관리", "출퇴근 관리", "게시판"]',
   0),
  ('starter', 'Starter', 'headcount', 6, 10, 39000,
   '6~10인 사업장',
   '["기본 대시보드", "직원 관리", "출퇴근 관리", "게시판", "스케줄 관리"]',
   1),
  ('growth', 'Growth', 'headcount', 11, 20, 79000,
   '11~20인 사업장',
   '["기본 대시보드", "직원 관리", "출퇴근 관리", "게시판", "스케줄 관리", "리콜 관리"]',
   2),
  ('pro', 'Pro', 'headcount', 21, 9999, 149000,
   '21인 이상 사업장',
   '["기본 대시보드", "직원 관리", "출퇴근 관리", "게시판", "스케줄 관리", "리콜 관리", "급여 관리"]',
   3)
ON CONFLICT (name) DO NOTHING;

-- 11. 기본 기능별 프리미엄 플랜 데이터
INSERT INTO subscription_plans (name, display_name, type, feature_id, price, description, features, sort_order) VALUES
  ('feature-ai-analysis', 'AI 데이터 분석', 'feature', 'ai-analysis', 30000,
   'AI 기반 경영 분석',
   '["AI 차트 분석", "자동 인사이트", "예측 리포트"]',
   10),
  ('feature-financial', '재무 관리', 'feature', 'financial', 20000,
   '수입/지출 재무 관리',
   '["수입/지출 관리", "손익 분석", "세금 계산"]',
   11),
  ('feature-marketing', '마케팅 자동화', 'feature', 'marketing', 29000,
   '네이버 블로그 마케팅 자동화',
   '["임상글 자동 생성", "SEO 분석", "게시물 관리"]',
   12)
ON CONFLICT (name) DO NOTHING;
