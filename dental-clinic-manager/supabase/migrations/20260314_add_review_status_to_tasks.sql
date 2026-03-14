-- 업무 상태에 'review' (검토 요청) 추가
-- 업무 프로세스: 대기 → 진행 중 → 검토 요청 → 완료

-- 기존 CHECK 제약 조건 삭제 후 새로운 제약 조건 추가
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'review', 'completed', 'on_hold', 'cancelled'));
