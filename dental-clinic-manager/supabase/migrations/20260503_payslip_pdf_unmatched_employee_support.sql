-- ============================================
-- 가입 안 한 직원의 PDF도 경비로 처리하도록 지원
-- Created: 2026-05-03
-- ============================================

-- 1. employee_user_id를 nullable로 변경, extracted_employee_name 추가
ALTER TABLE payroll_tax_office_files
  ALTER COLUMN employee_user_id DROP NOT NULL;
ALTER TABLE payroll_tax_office_files
  ADD COLUMN IF NOT EXISTS extracted_employee_name TEXT;

-- 2. 트리거 갱신: NULL employee_user_id 케이스 처리 + extracted_employee_name 활용
CREATE OR REPLACE FUNCTION sync_payslip_pdf_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
  v_display_name TEXT;
  v_existing_payroll BOOLEAN := FALSE;
  v_desc TEXT;
  v_source_label TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.total_payment IS NULL OR NEW.total_payment <= 0 THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 가입 직원이면 같은 월 payroll_statements 우선 (이중 계산 방지)
  IF NEW.employee_user_id IS NOT NULL THEN
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
  END IF;

  SELECT id INTO v_category_id FROM expense_categories
    WHERE clinic_id = NEW.clinic_id AND type = 'personnel' AND is_active = TRUE
    ORDER BY is_system_default DESC, display_order ASC
    LIMIT 1;

  IF v_category_id IS NULL THEN
    RAISE NOTICE 'No personnel category for clinic %, skipping PDF expense sync', NEW.clinic_id;
    RETURN NEW;
  END IF;

  -- 표시 이름: 가입 직원 이름 > PDF 추출 이름 > '미가입 직원'
  IF NEW.employee_user_id IS NOT NULL THEN
    SELECT COALESCE(name, NEW.extracted_employee_name, '직원') INTO v_display_name
      FROM users WHERE id = NEW.employee_user_id;
  END IF;
  v_display_name := COALESCE(v_display_name, NEW.extracted_employee_name, '미가입 직원')
    || CASE WHEN NEW.employee_user_id IS NULL THEN ' (미가입)' ELSE '' END;

  v_source_label := CASE WHEN NEW.employee_user_id IS NULL
    THEN '세무사무실 PDF · 미가입'
    ELSE '세무사무실 PDF' END;

  v_desc := v_display_name || ' 급여 ('
    || NEW.payment_year || '-' || LPAD(NEW.payment_month::TEXT, 2, '0')
    || ', ' || v_source_label || ')';

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
