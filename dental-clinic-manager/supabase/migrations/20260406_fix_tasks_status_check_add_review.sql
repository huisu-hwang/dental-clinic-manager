-- 업무 상태 CHECK 제약 조건에 'review' (검토 요청) 추가
-- 기존 마이그레이션(20260314)이 적용되지 않아 'review' 상태 변경 시 오류 발생하던 문제 수정

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'review', 'completed', 'on_hold', 'cancelled'));
