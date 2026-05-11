-- ============================================
-- 마스터 가입 승인 요청 SMS 1회 발송 추적용 컬럼 추가
-- Migration: 20260511_users_master_notify_sent_at.sql
-- Created: 2026-05-11
--
-- 배경: /api/admin/notify-master-on-signup 라우트가 누구나 호출 가능한 형태로 열려 있어
-- 임의의 userId 를 시도해 마스터에게 스팸 SMS 를 보낼 가능성이 있었다.
-- 1회 발송 후에는 같은 userId 로 호출해도 차단되도록 발송 시각을 기록한다.
-- (시간 제한과 함께 동작하여 가입 직후 30분 이내에만 발송 허용)
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS master_notify_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN users.master_notify_sent_at IS
  '마스터에게 신규 가입 승인 요청 SMS 를 발송한 시각. 1회 발송 차단 및 스팸 방지용.';
