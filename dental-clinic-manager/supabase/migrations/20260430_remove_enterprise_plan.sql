-- ============================================
-- Enterprise 플랜 제거 + Pro 플랜 범위 확장
-- Migration: 20260430_remove_enterprise_plan.sql
-- Created: 2026-04-30
--
-- 변경 사항
-- 1) Pro 플랜 max_users 50 → 9999 (21인 이상 모두 Pro로 통합)
-- 2) Enterprise 플랜 행 삭제
-- ============================================

UPDATE subscription_plans
SET max_users = 9999,
    description = '21인 이상 사업장'
WHERE name = 'pro' AND type = 'headcount';

DELETE FROM subscription_plans
WHERE name = 'enterprise' AND type = 'headcount';
