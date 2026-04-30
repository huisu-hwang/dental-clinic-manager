-- ============================================
-- 월간 성과 보고서 / 소개환자 관리를 유료 번들에 추가
-- Migration: 20260430_add_monthly_report_referral_to_bundles.sql
-- Created: 2026-04-30
--
-- 변경 사항
-- 1) standard-bundle features 에 "월간 성과 보고서", "소개환자 관리" 추가
-- 2) premium-bundle features 에 "월간 성과 보고서", "소개환자 관리" 추가
-- 가격은 변경 없음 (스탠다드 99,000원 / 프리미엄 499,000원)
-- ============================================

UPDATE subscription_plans
SET features = '["리콜 관리", "AI 데이터 분석", "경영 현황 (재무 관리)", "월간 성과 보고서", "소개환자 관리"]'::jsonb
WHERE name = 'standard-bundle';

UPDATE subscription_plans
SET features = '["리콜 관리", "AI 데이터 분석", "경영 현황 (재무 관리)", "월간 성과 보고서", "소개환자 관리", "마케팅 자동화"]'::jsonb
WHERE name = 'premium-bundle';
