-- =====================================================
-- 반복 업무 템플릿 (recurring_task_templates)
-- 주간/월간/연간 주기로 반복되는 업무 정의.
-- 실제 Task 인스턴스는 대시보드가 로드될 때 materialize_recurring_tasks()
-- RPC 호출로 tasks 테이블에 지연 생성된다.
-- =====================================================

CREATE TABLE IF NOT EXISTS recurring_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  recurrence_type TEXT NOT NULL
    CHECK (recurrence_type IN ('weekly','monthly','yearly')),
  -- weekly: 0=일 ~ 6=토 (JS getDay 및 Postgres EXTRACT(DOW)와 동일)
  recurrence_weekday       SMALLINT CHECK (recurrence_weekday BETWEEN 0 AND 6),
  -- monthly/yearly: 1~31 (해당 월 말일 초과 시 말일로 clamp)
  recurrence_day_of_month  SMALLINT CHECK (recurrence_day_of_month BETWEEN 1 AND 31),
  -- yearly: 1~12
  recurrence_month         SMALLINT CHECK (recurrence_month BETWEEN 1 AND 12),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date   DATE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtt_clinic_active ON recurring_task_templates(clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rtt_assignee      ON recurring_task_templates(assignee_id);

-- tasks에 템플릿 참조 컬럼 추가 (하위 호환)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID
  REFERENCES recurring_task_templates(id) ON DELETE SET NULL;

-- 동일 템플릿·동일 일자에 인스턴스가 중복 생성되지 않도록 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_template_due
  ON tasks(recurring_template_id, due_date)
  WHERE recurring_template_id IS NOT NULL;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE recurring_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view clinic templates" ON recurring_task_templates;
CREATE POLICY "Users view clinic templates" ON recurring_task_templates
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins insert templates" ON recurring_task_templates;
CREATE POLICY "Admins insert templates" ON recurring_task_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = recurring_task_templates.clinic_id
        AND role IN ('master_admin','owner','vice_director','manager','team_leader')
    )
  );

DROP POLICY IF EXISTS "Admins update templates" ON recurring_task_templates;
CREATE POLICY "Admins update templates" ON recurring_task_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = recurring_task_templates.clinic_id
        AND role IN ('master_admin','owner','vice_director','manager','team_leader')
    )
  );

DROP POLICY IF EXISTS "Admins delete templates" ON recurring_task_templates;
CREATE POLICY "Admins delete templates" ON recurring_task_templates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND clinic_id = recurring_task_templates.clinic_id
        AND role IN ('master_admin','owner','vice_director','manager','team_leader')
    )
  );

-- =====================================================
-- SECURITY DEFINER RPC: materialize_recurring_tasks
-- 일반 직원도 대시보드 로드 시 호출할 수 있도록 DEFINER로 정의.
-- tasks INSERT RLS("관리자만 생성")을 우회하지만, 호출자가 자기 clinic만
-- materialize 할 수 있도록 내부에서 검증한다.
-- =====================================================
CREATE OR REPLACE FUNCTION materialize_recurring_tasks(
  p_clinic_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_user_clinic UUID;
  t RECORD;
  v_dom SMALLINT;
  v_last_day SMALLINT;
  v_match BOOLEAN;
  v_inserted_id UUID;
BEGIN
  -- 호출자는 자기 clinic 만 materialize 할 수 있다
  SELECT clinic_id INTO v_user_clinic FROM users WHERE id = auth.uid();
  IF v_user_clinic IS NULL OR v_user_clinic <> p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized clinic for materialize_recurring_tasks';
  END IF;

  v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', p_date) + INTERVAL '1 month - 1 day'));

  FOR t IN
    SELECT * FROM recurring_task_templates
    WHERE clinic_id = p_clinic_id
      AND is_active = TRUE
      AND start_date <= p_date
      AND (end_date IS NULL OR end_date >= p_date)
  LOOP
    v_match := FALSE;

    IF t.recurrence_type = 'weekly' THEN
      -- Postgres EXTRACT(DOW): 0=Sunday..6=Saturday
      IF EXTRACT(DOW FROM p_date)::INT = t.recurrence_weekday THEN
        v_match := TRUE;
      END IF;
    ELSIF t.recurrence_type = 'monthly' THEN
      v_dom := LEAST(t.recurrence_day_of_month, v_last_day);
      IF EXTRACT(DAY FROM p_date)::INT = v_dom THEN
        v_match := TRUE;
      END IF;
    ELSIF t.recurrence_type = 'yearly' THEN
      IF EXTRACT(MONTH FROM p_date)::INT = t.recurrence_month
         AND EXTRACT(DAY FROM p_date)::INT = LEAST(t.recurrence_day_of_month, v_last_day) THEN
        v_match := TRUE;
      END IF;
    END IF;

    IF v_match THEN
      INSERT INTO tasks (
        clinic_id, title, description, priority,
        assignee_id, assigner_id, due_date, status, recurring_template_id
      ) VALUES (
        t.clinic_id, t.title, t.description, t.priority,
        t.assignee_id, t.assigner_id, p_date, 'pending', t.id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_inserted_id;

      IF v_inserted_id IS NOT NULL THEN
        v_count := v_count + 1;
        v_inserted_id := NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION materialize_recurring_tasks(UUID, DATE) TO authenticated;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION rtt_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rtt_updated_at ON recurring_task_templates;
CREATE TRIGGER trg_rtt_updated_at
BEFORE UPDATE ON recurring_task_templates
FOR EACH ROW EXECUTE FUNCTION rtt_set_updated_at();
