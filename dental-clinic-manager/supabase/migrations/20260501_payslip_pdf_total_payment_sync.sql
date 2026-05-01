-- ============================================
-- 세무사무실 PDF total_payment → expense_records 자동 동기화
-- Created: 2026-05-01
-- ============================================

-- 1. payroll_tax_office_files에 total_payment 컬럼 추가
ALTER TABLE payroll_tax_office_files
  ADD COLUMN IF NOT EXISTS total_payment INTEGER;

-- 2. expense_records에 payroll_tax_office_file_id 컬럼 + unique index
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS payroll_tax_office_file_id UUID
    REFERENCES payroll_tax_office_files(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_expense_records_tax_office_file;
CREATE UNIQUE INDEX idx_expense_records_tax_office_file
  ON expense_records(payroll_tax_office_file_id);

-- 3. expense_records.source CHECK 갱신 ('payroll_pdf' 추가)
ALTER TABLE expense_records DROP CONSTRAINT IF EXISTS expense_records_source_check;
ALTER TABLE expense_records ADD CONSTRAINT expense_records_source_check
  CHECK (source IN ('manual','payroll','payroll_pdf'));

-- 4. PDF → expense_records 동기화 트리거
CREATE OR REPLACE FUNCTION sync_payslip_pdf_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
  v_employee_name TEXT;
  v_existing_payroll BOOLEAN;
  v_desc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.total_payment IS NULL OR NEW.total_payment <= 0 THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 같은 (clinic, employee, year, month) payroll_statements 우선 — PDF 동기화 스킵
  SELECT EXISTS (
    SELECT 1 FROM payroll_statements
    WHERE clinic_id = NEW.clinic_id
      AND employee_user_id = NEW.employee_user_id
      AND payment_year = NEW.payment_year
      AND payment_month = NEW.payment_month
  ) INTO v_existing_payroll;

  IF v_existing_payroll THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id INTO v_category_id FROM expense_categories
    WHERE clinic_id = NEW.clinic_id AND type = 'personnel' AND is_active = TRUE
    ORDER BY is_system_default DESC, display_order ASC
    LIMIT 1;

  IF v_category_id IS NULL THEN
    RAISE NOTICE 'No personnel category for clinic %, skipping PDF expense sync', NEW.clinic_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, '직원') INTO v_employee_name
    FROM users WHERE id = NEW.employee_user_id;
  v_employee_name := COALESCE(v_employee_name, '직원');

  v_desc := v_employee_name || ' 급여 ('
    || NEW.payment_year || '-' || LPAD(NEW.payment_month::TEXT, 2, '0')
    || ', 세무사무실)';

  INSERT INTO expense_records (
    clinic_id, category_id, year, month, amount, description,
    source, payroll_tax_office_file_id
  ) VALUES (
    NEW.clinic_id, v_category_id, NEW.payment_year, NEW.payment_month,
    NEW.total_payment, v_desc, 'payroll_pdf', NEW.id
  )
  ON CONFLICT (payroll_tax_office_file_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        year = EXCLUDED.year,
        month = EXCLUDED.month,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payslip_pdf_to_expense ON payroll_tax_office_files;
CREATE TRIGGER trg_sync_payslip_pdf_to_expense
  AFTER INSERT OR UPDATE OR DELETE ON payroll_tax_office_files
  FOR EACH ROW EXECUTE FUNCTION sync_payslip_pdf_to_expense();

-- 5. payroll_statements 추가 시 같은 (clinic,employee,year,month)의 PDF expense 제거
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

  -- 같은 (clinic,employee,year,month) PDF expense 제거 (중복 방지)
  DELETE FROM expense_records er
  USING payroll_tax_office_files f
  WHERE er.payroll_tax_office_file_id = f.id
    AND f.clinic_id = NEW.clinic_id
    AND f.employee_user_id = NEW.employee_user_id
    AND f.payment_year = NEW.payment_year
    AND f.payment_month = NEW.payment_month;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
