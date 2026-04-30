-- ============================================
-- 업무 분류(task_period) 추가 + 분기별(quarterly) 반복 지원
-- Migration: 20260430_add_task_period_and_quarterly.sql
-- Created: 2026-04-30
-- ============================================

-- 1. tasks 테이블에 task_period 컬럼 추가
--    weekly, monthly, quarterly, yearly, general(분류 없음)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_period TEXT
    CHECK (task_period IN ('weekly', 'monthly', 'quarterly', 'yearly', 'general'))
    DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_tasks_task_period
  ON tasks(clinic_id, task_period);

-- 2. recurring_task_templates에 quarterly 추가
--    기존 CHECK 제약을 교체하여 'quarterly'를 허용
ALTER TABLE recurring_task_templates
  DROP CONSTRAINT IF EXISTS recurring_task_templates_recurrence_type_check;

ALTER TABLE recurring_task_templates
  ADD CONSTRAINT recurring_task_templates_recurrence_type_check
    CHECK (recurrence_type IN ('weekly', 'monthly', 'quarterly', 'yearly'));

-- 3. 분기별 반복은 recurrence_month(분기 시작 월: 1~3 중 하나) +
--    recurrence_day_of_month(해당 월의 일자)로 표현
--    예) recurrence_month=1, recurrence_day_of_month=15 →
--        매분기 첫 달 15일 (1·4·7·10월 15일)
--    별도 컬럼 추가 없이 기존 컬럼 재사용

-- 4. 기존 반복 템플릿이 자동 생성한 task의 task_period를 동기화
UPDATE tasks t
SET task_period = rt.recurrence_type
FROM recurring_task_templates rt
WHERE t.recurring_template_id = rt.id
  AND (t.task_period IS NULL OR t.task_period = 'general');
