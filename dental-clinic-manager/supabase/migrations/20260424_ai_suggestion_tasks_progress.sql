-- ============================================
-- AI 제안 태스크 진행 상황 세부 컬럼 추가
-- Migration: 20260424_ai_suggestion_tasks_progress.sql
-- Created: 2026-04-24
--
-- 목적: running 상태에서 내부 단계(worktree 생성 → Claude 분석 → 파일 수정 → 빌드 → 커밋 → PR)를
--       실시간으로 웹앱에 노출하기 위함.
-- ============================================

-- progress_step: 현재 처리 단계
--   initializing, creating_worktree, analyzing, editing,
--   building, rebuilding, committing, pushing, creating_pr
-- progress_detail: 단계별 부가 정보 (iteration, currentFile, buildRetry 등)
ALTER TABLE ai_suggestion_tasks
  ADD COLUMN IF NOT EXISTS progress_step TEXT,
  ADD COLUMN IF NOT EXISTS progress_detail JSONB;

CREATE INDEX IF NOT EXISTS idx_ai_suggestion_tasks_progress_step ON ai_suggestion_tasks(progress_step);

-- ============================================
-- Migration Complete
-- ============================================
