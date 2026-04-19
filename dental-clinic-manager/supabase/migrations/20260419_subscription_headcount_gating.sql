-- supabase/migrations/20260419_subscription_headcount_gating.sql
-- 구독 플랜 개편: 직원 수 게이팅 + 프리미엄/주식매매 플랜 정비 + 환불 컬럼

BEGIN;

-- 1. Free 상한 4명, Starter 하한 5명으로 조정
UPDATE subscription_plans
   SET max_users = 4, description = '4인 이하 사업장 무료'
 WHERE name = 'free';

UPDATE subscription_plans
   SET min_users = 5, description = '5~10인 사업장'
 WHERE name = 'starter';

-- 2. 프리미엄 패키지 (UI는 이미 premium-bundle 가정)
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('premium-bundle', '프리미엄 패키지', 'feature', 'premium-bundle', 499000,
   'AI 분석 + 경영 현황 + 마케팅 자동화 통합',
   '["AI 데이터 분석","경영 현황 관리","마케팅 자동화"]'::jsonb, 9)
ON CONFLICT (name) DO UPDATE
   SET price = EXCLUDED.price,
       feature_id = EXCLUDED.feature_id,
       description = EXCLUDED.description,
       features = EXCLUDED.features,
       display_name = EXCLUDED.display_name,
       sort_order = EXCLUDED.sort_order;

-- 3. 주식 자동매매 플랜 (UI priceLabel: '수익의 5%' 유지)
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('feature-investment', '주식 자동매매', 'feature', 'investment', 0,
   '수익의 5% 성과 연동 과금',
   '["AI 자동매매 전략","실시간 포트폴리오","백테스트"]'::jsonb, 13)
ON CONFLICT (name) DO UPDATE
   SET description = EXCLUDED.description,
       features = EXCLUDED.features;

-- 4. 환불 컬럼 (subscription_payments)
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason   TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ;

COMMIT;
