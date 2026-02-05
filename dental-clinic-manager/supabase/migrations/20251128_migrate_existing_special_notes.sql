-- ============================================================================
-- Migration: Migrate existing special_notes from daily_reports to special_notes_history
-- Created: 2025-11-28
-- Purpose: 기존 daily_reports 테이블의 special_notes 데이터를 special_notes_history로 복사
-- ============================================================================

-- 기존 daily_reports의 special_notes 데이터를 special_notes_history 테이블로 마이그레이션
INSERT INTO special_notes_history (
  clinic_id,
  report_date,
  content,
  author_id,
  author_name,
  is_past_date_edit,
  edited_at,
  created_at
)
SELECT
  dr.clinic_id,
  dr.date as report_date,
  dr.special_notes as content,
  NULL as author_id,
  '기존 데이터' as author_name,
  false as is_past_date_edit,
  COALESCE(dr.created_at, NOW()) as edited_at,
  COALESCE(dr.created_at, NOW()) as created_at
FROM daily_reports dr
WHERE dr.special_notes IS NOT NULL
  AND dr.special_notes != ''
  AND TRIM(dr.special_notes) != ''
  AND dr.clinic_id IS NOT NULL;

-- 마이그레이션 결과 확인용 쿼리 (실행 후 삭제 가능)
-- SELECT COUNT(*) as migrated_count FROM special_notes_history;

-- ============================================================================
-- Migration complete
-- ============================================================================
