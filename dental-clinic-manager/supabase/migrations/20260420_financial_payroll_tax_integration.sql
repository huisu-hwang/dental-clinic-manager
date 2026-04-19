-- =====================================================
-- Migration: 경영 현황 ↔ 급여 연동 + 세무 설정
-- Created: 2026-04-20
-- Purpose:
--   1) 급여 명세서 저장 시 인건비 지출(expense_records)에 자동 반영
--   2) 세무 설정(clinic_tax_settings) 테이블로 예상 세금 계산 근거 저장
-- =====================================================

-- 1) clinic_tax_settings 신규 테이블
CREATE TABLE IF NOT EXISTS clinic_tax_settings (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  business_type VARCHAR(20) NOT NULL DEFAULT 'individual'
    CHECK (business_type IN ('individual','corporate')),
  bookkeeping_type VARCHAR(20) NOT NULL DEFAULT 'double'
    CHECK (bookkeeping_type IN ('simple','double')),
  dependent_count INTEGER NOT NULL DEFAULT 1 CHECK (dependent_count >= 1),
  spouse_deduction BOOLEAN NOT NULL DEFAULT FALSE,
  apply_standard_deduction BOOLEAN NOT NULL DEFAULT TRUE,
  noranumbrella_monthly INTEGER NOT NULL DEFAULT 0 CHECK (noranumbrella_monthly >= 0),
  national_pension_monthly INTEGER NOT NULL DEFAULT 0 CHECK (national_pension_monthly >= 0),
  health_insurance_monthly INTEGER NOT NULL DEFAULT 0 CHECK (health_insurance_monthly >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinic_tax_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_settings_select ON clinic_tax_settings;
CREATE POLICY tax_settings_select ON clinic_tax_settings FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS tax_settings_write ON clinic_tax_settings;
CREATE POLICY tax_settings_write ON clinic_tax_settings FOR ALL
  USING (clinic_id IN (
    SELECT clinic_id FROM users WHERE id = auth.uid() AND role IN ('owner','master_admin')
  ))
  WITH CHECK (clinic_id IN (
    SELECT clinic_id FROM users WHERE id = auth.uid() AND role IN ('owner','master_admin')
  ));

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tax_settings_updated_at ON clinic_tax_settings;
CREATE TRIGGER trg_tax_settings_updated_at
  BEFORE UPDATE ON clinic_tax_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 2) expense_records 컬럼 추가 (급여 연동)
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','payroll'));

ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS payroll_statement_id UUID
    REFERENCES payroll_statements(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_expense_records_payroll;
CREATE UNIQUE INDEX idx_expense_records_payroll
  ON expense_records(payroll_statement_id);

-- 3) 급여 명세서 → 인건비 지출 동기화 트리거
CREATE OR REPLACE FUNCTION sync_payroll_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
  v_amount INTEGER;
  v_desc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_statement_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT id INTO v_category_id FROM expense_categories
    WHERE clinic_id = NEW.clinic_id AND type = 'personnel' AND is_active = TRUE
    ORDER BY is_system_default DESC, display_order ASC
    LIMIT 1;

  IF v_category_id IS NULL THEN
    RAISE NOTICE 'No personnel category for clinic %, skipping expense sync', NEW.clinic_id;
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.total_payment, NEW.total_earnings, 0);
  v_desc := COALESCE(NEW.employee_name, '직원') || ' 급여 ('
    || NEW.payment_year || '-' || LPAD(NEW.payment_month::TEXT, 2, '0') || ')';

  INSERT INTO expense_records (
    clinic_id, category_id, year, month, amount, description,
    source, payroll_statement_id
  ) VALUES (
    NEW.clinic_id, v_category_id, NEW.payment_year, NEW.payment_month,
    v_amount, v_desc, 'payroll', NEW.id
  )
  ON CONFLICT (payroll_statement_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        year = EXCLUDED.year,
        month = EXCLUDED.month,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payroll_to_expense ON payroll_statements;
CREATE TRIGGER trg_sync_payroll_to_expense
  AFTER INSERT OR UPDATE OR DELETE ON payroll_statements
  FOR EACH ROW EXECUTE FUNCTION sync_payroll_to_expense();

-- 4) 기존 급여 데이터 백필 (최초 1회)
DO $$
DECLARE
  rec RECORD;
  v_category_id UUID;
  v_amount INTEGER;
  v_desc TEXT;
BEGIN
  FOR rec IN SELECT * FROM payroll_statements LOOP
    SELECT id INTO v_category_id FROM expense_categories
      WHERE clinic_id = rec.clinic_id AND type = 'personnel' AND is_active = TRUE
      ORDER BY is_system_default DESC, display_order ASC
      LIMIT 1;

    IF v_category_id IS NULL THEN
      CONTINUE;
    END IF;

    v_amount := COALESCE(rec.total_payment, rec.total_earnings, 0);
    v_desc := COALESCE(rec.employee_name, '직원') || ' 급여 ('
      || rec.payment_year || '-' || LPAD(rec.payment_month::TEXT, 2, '0') || ')';

    INSERT INTO expense_records (
      clinic_id, category_id, year, month, amount, description,
      source, payroll_statement_id
    ) VALUES (
      rec.clinic_id, v_category_id, rec.payment_year, rec.payment_month,
      v_amount, v_desc, 'payroll', rec.id
    )
    ON CONFLICT (payroll_statement_id) DO NOTHING;
  END LOOP;
END $$;
