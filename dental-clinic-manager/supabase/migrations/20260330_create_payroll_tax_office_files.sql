-- ============================================
-- 세무사무실 급여명세서 PDF 파일 메타데이터 테이블
-- Migration: 20260330_create_payroll_tax_office_files.sql
-- Created: 2026-03-30
-- ============================================

CREATE TABLE IF NOT EXISTS payroll_tax_office_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_year INTEGER NOT NULL,
  payment_month INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, employee_user_id, payment_year, payment_month)
);

CREATE INDEX idx_payroll_tax_office_clinic_year_month
  ON payroll_tax_office_files(clinic_id, payment_year, payment_month);

CREATE INDEX idx_payroll_tax_office_employee
  ON payroll_tax_office_files(employee_user_id);

ALTER TABLE payroll_tax_office_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_tax_office_files_select" ON payroll_tax_office_files
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "payroll_tax_office_files_insert" ON payroll_tax_office_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_tax_office_files.clinic_id
      AND role = 'owner'
    )
  );

CREATE POLICY "payroll_tax_office_files_delete" ON payroll_tax_office_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_tax_office_files.clinic_id
      AND role = 'owner'
    )
  );

CREATE POLICY "payroll_tax_office_files_update" ON payroll_tax_office_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_tax_office_files.clinic_id
      AND role = 'owner'
    )
  );

-- Storage 버킷
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payroll-documents', 'payroll-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
