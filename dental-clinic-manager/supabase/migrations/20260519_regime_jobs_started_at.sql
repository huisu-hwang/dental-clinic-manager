-- ============================================
-- regime_jobs.started_at 컬럼 추가
-- Created: 2026-05-19
--
-- Phase 3-B (사용자 ticker 분석) 워커가 status='running' 갱신 시
-- started_at 도 함께 기록할 수 있도록 추가
-- ============================================

ALTER TABLE regime_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
