-- ============================================
-- 인건비 우선순위 변경: 세무사무실 PDF 명세서 > 앱 내 payroll_statements
-- Created: 2026-05-08
--
-- 배경:
--   - 기존 트리거는 payroll_statements가 있으면 PDF 동기화를 스킵했음.
--   - 그러나 세무사무실 PDF가 실제 지급된 금액의 진실 원천이므로 PDF 우선이 맞음.
--   - 예: 김지성 2026-04 → payroll_statements 3,068,130원 vs PDF 3,412,740원
--
-- 정책:
--   1) PDF(total_payment > 0)가 있으면 PDF가 인건비로 반영됨.
--   2) 같은 (clinic, employee, year, month) payroll_statements 기반 expense는 제거됨.
--   3) PDF가 없거나 total_payment NULL이면 payroll_statements 기반 expense를 사용.
-- ============================================

-- 1. PDF → expense_records (PDF 우선)
CREATE OR REPLACE FUNCTION sync_payslip_pdf_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
  v_employee_name TEXT;
  v_desc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = OLD.id;
    -- PDF 삭제 시 같은 (clinic,employee,year,month) payroll_statements가 있으면
    -- 해당 payroll expense를 새로 생성 (PDF가 없어졌으므로 폴백).
    INSERT INTO expense_records (
      clinic_id, category_id, year, month, amount, description,
      source, payroll_statement_id
    )
    SELECT
      ps.clinic_id,
      (SELECT id FROM expense_categories
        WHERE clinic_id = ps.clinic_id AND type = 'personnel' AND is_active = TRUE
        ORDER BY is_system_default DESC, display_order ASC LIMIT 1),
      ps.payment_year, ps.payment_month,
      COALESCE(ps.total_payment, ps.total_earnings, 0),
      COALESCE(ps.employee_name, '직원') || ' 급여 ('
        || ps.payment_year || '-' || LPAD(ps.payment_month::TEXT, 2, '0') || ')',
      'payroll', ps.id
    FROM payroll_statements ps
    WHERE ps.clinic_id = OLD.clinic_id
      AND ps.employee_user_id = OLD.employee_user_id
      AND ps.payment_year = OLD.payment_year
      AND ps.payment_month = OLD.payment_month
      AND COALESCE(ps.total_payment, ps.total_earnings, 0) > 0
    ON CONFLICT (payroll_statement_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          description = EXCLUDED.description,
          category_id = EXCLUDED.category_id,
          updated_at = NOW();
    RETURN OLD;
  END IF;

  -- total_payment 없으면 PDF expense 제거 + payroll 폴백 시도
  IF NEW.total_payment IS NULL OR NEW.total_payment <= 0 THEN
    DELETE FROM expense_records WHERE payroll_tax_office_file_id = NEW.id;
    INSERT INTO expense_records (
      clinic_id, category_id, year, month, amount, description,
      source, payroll_statement_id
    )
    SELECT
      ps.clinic_id,
      (SELECT id FROM expense_categories
        WHERE clinic_id = ps.clinic_id AND type = 'personnel' AND is_active = TRUE
        ORDER BY is_system_default DESC, display_order ASC LIMIT 1),
      ps.payment_year, ps.payment_month,
      COALESCE(ps.total_payment, ps.total_earnings, 0),
      COALESCE(ps.employee_name, '직원') || ' 급여 ('
        || ps.payment_year || '-' || LPAD(ps.payment_month::TEXT, 2, '0') || ')',
      'payroll', ps.id
    FROM payroll_statements ps
    WHERE ps.clinic_id = NEW.clinic_id
      AND ps.employee_user_id = NEW.employee_user_id
      AND ps.payment_year = NEW.payment_year
      AND ps.payment_month = NEW.payment_month
      AND COALESCE(ps.total_payment, ps.total_earnings, 0) > 0
    ON CONFLICT (payroll_statement_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          description = EXCLUDED.description,
          category_id = EXCLUDED.category_id,
          updated_at = NOW();
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

  -- 같은 (clinic,employee,year,month) payroll_statements 기반 expense 삭제
  DELETE FROM expense_records er
  USING payroll_statements ps
  WHERE er.payroll_statement_id = ps.id
    AND ps.clinic_id = NEW.clinic_id
    AND ps.employee_user_id = NEW.employee_user_id
    AND ps.payment_year = NEW.payment_year
    AND ps.payment_month = NEW.payment_month;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. payroll_statements → expense_records (PDF 있으면 스킵)
CREATE OR REPLACE FUNCTION sync_payroll_to_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id UUID;
  v_amount INTEGER;
  v_desc TEXT;
  v_pdf_exists BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM expense_records WHERE payroll_statement_id = OLD.id;
    RETURN OLD;
  END IF;

  -- 같은 (clinic,employee,year,month) PDF가 total_payment > 0으로 있으면
  -- payroll expense는 만들지 않음 (PDF가 우선).
  SELECT EXISTS (
    SELECT 1 FROM payroll_tax_office_files f
    WHERE f.clinic_id = NEW.clinic_id
      AND f.employee_user_id = NEW.employee_user_id
      AND f.payment_year = NEW.payment_year
      AND f.payment_month = NEW.payment_month
      AND COALESCE(f.total_payment, 0) > 0
  ) INTO v_pdf_exists;

  IF v_pdf_exists THEN
    DELETE FROM expense_records WHERE payroll_statement_id = NEW.id;
    RETURN NEW;
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

-- 3. 백필: 모든 PDF에 대해 expense 재반영 + 중복 payroll expense 삭제
DO $$
DECLARE
  rec RECORD;
  v_category_id UUID;
  v_employee_name TEXT;
  v_desc TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM payroll_tax_office_files
    WHERE COALESCE(total_payment, 0) > 0
  LOOP
    SELECT id INTO v_category_id FROM expense_categories
      WHERE clinic_id = rec.clinic_id AND type = 'personnel' AND is_active = TRUE
      ORDER BY is_system_default DESC, display_order ASC
      LIMIT 1;

    IF v_category_id IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(name, '직원') INTO v_employee_name
      FROM users WHERE id = rec.employee_user_id;
    v_employee_name := COALESCE(v_employee_name, '직원');

    v_desc := v_employee_name || ' 급여 ('
      || rec.payment_year || '-' || LPAD(rec.payment_month::TEXT, 2, '0')
      || ', 세무사무실)';

    INSERT INTO expense_records (
      clinic_id, category_id, year, month, amount, description,
      source, payroll_tax_office_file_id
    ) VALUES (
      rec.clinic_id, v_category_id, rec.payment_year, rec.payment_month,
      rec.total_payment, v_desc, 'payroll_pdf', rec.id
    )
    ON CONFLICT (payroll_tax_office_file_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          description = EXCLUDED.description,
          category_id = EXCLUDED.category_id,
          updated_at = NOW();

    -- 같은 (clinic,employee,year,month) payroll expense 삭제 (PDF 우선)
    DELETE FROM expense_records er
    USING payroll_statements ps
    WHERE er.payroll_statement_id = ps.id
      AND ps.clinic_id = rec.clinic_id
      AND ps.employee_user_id = rec.employee_user_id
      AND ps.payment_year = rec.payment_year
      AND ps.payment_month = rec.payment_month;
  END LOOP;
END $$;
