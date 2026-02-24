-- =============================================
-- 업무 체크리스트 테이블 생성 SQL
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 업무 템플릿 테이블 (실장이 생성, 원장이 승인)
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  period TEXT NOT NULL CHECK (period IN ('before_treatment', 'during_treatment', 'before_leaving')),
  sort_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 일일 체크리스트 기록 테이블
CREATE TABLE IF NOT EXISTS daily_task_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- 같은 날 같은 업무에 대해 중복 체크 방지
  UNIQUE(template_id, user_id, check_date)
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_task_templates_clinic_id ON task_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_assigned_user ON task_templates(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_status ON task_templates(status);
CREATE INDEX IF NOT EXISTS idx_task_templates_period ON task_templates(period);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(clinic_id, is_active, status);

CREATE INDEX IF NOT EXISTS idx_daily_task_checks_clinic_id ON daily_task_checks(clinic_id);
CREATE INDEX IF NOT EXISTS idx_daily_task_checks_user_date ON daily_task_checks(user_id, check_date);
CREATE INDEX IF NOT EXISTS idx_daily_task_checks_template ON daily_task_checks(template_id);
CREATE INDEX IF NOT EXISTS idx_daily_task_checks_date ON daily_task_checks(check_date);

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_templates_updated_at ON task_templates;
CREATE TRIGGER task_templates_updated_at
  BEFORE UPDATE ON task_templates
  FOR EACH ROW EXECUTE FUNCTION update_task_updated_at();

DROP TRIGGER IF EXISTS daily_task_checks_updated_at ON daily_task_checks;
CREATE TRIGGER daily_task_checks_updated_at
  BEFORE UPDATE ON daily_task_checks
  FOR EACH ROW EXECUTE FUNCTION update_task_updated_at();

-- 5. RLS 정책 (Row Level Security)
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_task_checks ENABLE ROW LEVEL SECURITY;

-- task_templates RLS: 같은 clinic_id의 사용자만 접근
CREATE POLICY "task_templates_select" ON task_templates
  FOR SELECT USING (true);

CREATE POLICY "task_templates_insert" ON task_templates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "task_templates_update" ON task_templates
  FOR UPDATE USING (true);

CREATE POLICY "task_templates_delete" ON task_templates
  FOR DELETE USING (true);

-- daily_task_checks RLS: 같은 clinic_id의 사용자만 접근
CREATE POLICY "daily_task_checks_select" ON daily_task_checks
  FOR SELECT USING (true);

CREATE POLICY "daily_task_checks_insert" ON daily_task_checks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "daily_task_checks_update" ON daily_task_checks
  FOR UPDATE USING (true);

CREATE POLICY "daily_task_checks_delete" ON daily_task_checks
  FOR DELETE USING (true);
