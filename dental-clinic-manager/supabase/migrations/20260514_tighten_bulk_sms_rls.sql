-- ============================================
-- bulk_sms_* RLS service_all 정책 제거
-- Migration: 20260514_tighten_bulk_sms_rls.sql
--
-- 이유: 기존 service_all 정책은 TO 절이 없어 모든 role(PUBLIC)에 적용되어
--       _select 정책의 clinic 격리를 우회 가능. 서버는 service role 키로
--       RLS를 bypass하므로 해당 정책이 불필요하다.
-- ============================================

DROP POLICY IF EXISTS "bulk_sms_campaigns_service_all" ON bulk_sms_campaigns;
DROP POLICY IF EXISTS "bulk_sms_recipients_service_all" ON bulk_sms_recipients;
DROP POLICY IF EXISTS "bulk_sms_templates_service_all" ON bulk_sms_templates;
