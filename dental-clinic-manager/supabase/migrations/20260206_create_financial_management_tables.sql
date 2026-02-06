-- ============================================
-- 병원 경영 현황 관리 테이블 생성
-- Migration: 20260206_create_financial_management_tables.sql
-- Created: 2026-02-06
--
-- 기능:
-- - 수입 기록 관리 (보험/비보험 진료비)
-- - 지출 카테고리 관리 (인건비, 임대료, 재료비 등)
-- - 지출 기록 관리 (홈택스 연동 가능 여부 구분)
-- - 세금 기록 관리 (종합소득세, 지방소득세 등)
-- - 월별 재무 요약 뷰
-- ============================================

-- ============================================
-- 1. 지출 카테고리 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('personnel', 'rent', 'utilities', 'material', 'lab', 'equipment', 'marketing', 'insurance', 'tax', 'other')),
  description TEXT,
  is_hometax_trackable BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  is_system_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(clinic_id, name)
);

-- 코멘트 추가
COMMENT ON TABLE expense_categories IS '지출 카테고리 테이블';
COMMENT ON COLUMN expense_categories.type IS '카테고리 유형: personnel(인건비), rent(임대료), utilities(관리비), material(재료비), lab(기공비), equipment(장비), marketing(광고비), insurance(보험료), tax(세금/공과금), other(기타)';
COMMENT ON COLUMN expense_categories.is_hometax_trackable IS '홈택스 조회 가능 여부 (세금계산서/사업용카드)';
COMMENT ON COLUMN expense_categories.is_recurring IS '반복 지출 여부 (월세, 관리비 등)';
COMMENT ON COLUMN expense_categories.is_system_default IS '시스템 기본 카테고리 여부';

-- ============================================
-- 2. 수입 기록 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS revenue_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- 보험 진료 수입
  insurance_revenue DECIMAL(15, 2) DEFAULT 0,
  insurance_patient_count INTEGER DEFAULT 0,

  -- 비보험 진료 수입
  non_insurance_revenue DECIMAL(15, 2) DEFAULT 0,
  non_insurance_patient_count INTEGER DEFAULT 0,

  -- 기타 수입 (정부지원금 등)
  other_revenue DECIMAL(15, 2) DEFAULT 0,
  other_revenue_description TEXT,

  -- 총 수입
  total_revenue DECIMAL(15, 2) GENERATED ALWAYS AS (insurance_revenue + non_insurance_revenue + other_revenue) STORED,

  -- 데이터 소스 정보
  source_type VARCHAR(50) DEFAULT 'manual' CHECK (source_type IN ('manual', 'excel', 'image', 'api')),
  source_file_url TEXT,
  source_file_name VARCHAR(255),

  -- 메모
  notes TEXT,

  -- 메타데이터
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(clinic_id, year, month)
);

-- 코멘트 추가
COMMENT ON TABLE revenue_records IS '월별 수입 기록 테이블';
COMMENT ON COLUMN revenue_records.insurance_revenue IS '보험 진료 수입 (건강보험공단 청구분)';
COMMENT ON COLUMN revenue_records.non_insurance_revenue IS '비보험 진료 수입 (현금/카드 수납)';
COMMENT ON COLUMN revenue_records.other_revenue IS '기타 수입 (정부 지원금, 보조금 등)';
COMMENT ON COLUMN revenue_records.source_type IS '데이터 입력 방식: manual(수동입력), excel(엑셀업로드), image(이미지OCR), api(API연동)';

-- ============================================
-- 3. 지출 기록 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS expense_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE RESTRICT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- 지출 정보
  amount DECIMAL(15, 2) NOT NULL,
  description TEXT,
  vendor_name VARCHAR(200),

  -- 세금계산서/영수증 정보
  has_tax_invoice BOOLEAN DEFAULT false,
  tax_invoice_number VARCHAR(100),
  tax_invoice_date DATE,

  -- 결제 정보
  payment_method VARCHAR(50) CHECK (payment_method IN ('card', 'cash', 'transfer', 'auto_transfer')),
  is_business_card BOOLEAN DEFAULT false,

  -- 홈택스 연동 정보
  is_hometax_synced BOOLEAN DEFAULT false,
  hometax_sync_date TIMESTAMP WITH TIME ZONE,

  -- 메모
  notes TEXT,

  -- 메타데이터
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 코멘트 추가
COMMENT ON TABLE expense_records IS '지출 기록 테이블';
COMMENT ON COLUMN expense_records.has_tax_invoice IS '세금계산서 발급 여부';
COMMENT ON COLUMN expense_records.is_business_card IS '사업용 카드 결제 여부';
COMMENT ON COLUMN expense_records.is_hometax_synced IS '홈택스에서 조회 가능한 지출인지 여부';

-- ============================================
-- 4. 급여 지출 연동 테이블 (payroll_statements 연결)
-- ============================================
CREATE TABLE IF NOT EXISTS payroll_expense_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  payroll_statement_id UUID NOT NULL,
  expense_record_id UUID REFERENCES expense_records(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- 급여 관련 지출 내역
  total_salary DECIMAL(15, 2) NOT NULL,
  employer_national_pension DECIMAL(15, 2) DEFAULT 0,
  employer_health_insurance DECIMAL(15, 2) DEFAULT 0,
  employer_employment_insurance DECIMAL(15, 2) DEFAULT 0,
  employer_industrial_insurance DECIMAL(15, 2) DEFAULT 0,
  total_employer_insurance DECIMAL(15, 2) GENERATED ALWAYS AS (
    employer_national_pension + employer_health_insurance +
    employer_employment_insurance + employer_industrial_insurance
  ) STORED,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(clinic_id, year, month, payroll_statement_id)
);

COMMENT ON TABLE payroll_expense_links IS '급여 명세서와 지출 기록 연결 테이블';
COMMENT ON COLUMN payroll_expense_links.total_salary IS '총 급여 지급액';
COMMENT ON COLUMN payroll_expense_links.employer_national_pension IS '사업자 부담 국민연금 (4.5%)';
COMMENT ON COLUMN payroll_expense_links.employer_health_insurance IS '사업자 부담 건강보험 (3.545% + 장기요양)';
COMMENT ON COLUMN payroll_expense_links.employer_employment_insurance IS '사업자 부담 고용보험 (0.9%)';
COMMENT ON COLUMN payroll_expense_links.employer_industrial_insurance IS '산재보험료';

-- ============================================
-- 5. 세금 기록 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS tax_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- 과세 정보
  taxable_income DECIMAL(15, 2) DEFAULT 0,

  -- 세금 항목
  income_tax DECIMAL(15, 2) DEFAULT 0,
  local_income_tax DECIMAL(15, 2) DEFAULT 0,
  vat DECIMAL(15, 2) DEFAULT 0,
  property_tax DECIMAL(15, 2) DEFAULT 0,
  other_tax DECIMAL(15, 2) DEFAULT 0,

  -- 총 세금
  total_tax DECIMAL(15, 2) GENERATED ALWAYS AS (
    income_tax + local_income_tax + vat + property_tax + other_tax
  ) STORED,

  -- 정부 지원금/공제
  government_support DECIMAL(15, 2) DEFAULT 0,
  tax_deductions DECIMAL(15, 2) DEFAULT 0,

  -- 실제 납부 세금
  actual_tax_paid DECIMAL(15, 2) GENERATED ALWAYS AS (
    GREATEST(0, income_tax + local_income_tax + vat + property_tax + other_tax - tax_deductions)
  ) STORED,

  -- 계산 방식
  calculation_method VARCHAR(50) DEFAULT 'auto' CHECK (calculation_method IN ('auto', 'manual', 'accountant')),

  -- 메모
  notes TEXT,

  -- 메타데이터
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(clinic_id, year, month)
);

COMMENT ON TABLE tax_records IS '월별 세금 기록 테이블';
COMMENT ON COLUMN tax_records.taxable_income IS '과세 대상 소득 (수입 - 필요경비)';
COMMENT ON COLUMN tax_records.income_tax IS '종합소득세';
COMMENT ON COLUMN tax_records.local_income_tax IS '지방소득세 (소득세의 10%)';
COMMENT ON COLUMN tax_records.vat IS '부가가치세 (비보험 중 과세 대상)';
COMMENT ON COLUMN tax_records.government_support IS '정부 지원금';
COMMENT ON COLUMN tax_records.calculation_method IS '계산 방식: auto(자동계산), manual(수동입력), accountant(세무사)';

-- ============================================
-- 6. 월별 재무 요약 뷰
-- ============================================
CREATE OR REPLACE VIEW financial_summary_view AS
WITH monthly_revenue AS (
  SELECT
    clinic_id,
    year,
    month,
    insurance_revenue,
    non_insurance_revenue,
    other_revenue,
    total_revenue,
    source_type
  FROM revenue_records
),
monthly_expenses AS (
  SELECT
    e.clinic_id,
    e.year,
    e.month,
    SUM(e.amount) as total_expense,
    SUM(CASE WHEN c.type = 'personnel' THEN e.amount ELSE 0 END) as personnel_expense,
    SUM(CASE WHEN c.type = 'rent' THEN e.amount ELSE 0 END) as rent_expense,
    SUM(CASE WHEN c.type = 'utilities' THEN e.amount ELSE 0 END) as utilities_expense,
    SUM(CASE WHEN c.type = 'material' THEN e.amount ELSE 0 END) as material_expense,
    SUM(CASE WHEN c.type = 'lab' THEN e.amount ELSE 0 END) as lab_expense,
    SUM(CASE WHEN c.type = 'equipment' THEN e.amount ELSE 0 END) as equipment_expense,
    SUM(CASE WHEN c.type = 'marketing' THEN e.amount ELSE 0 END) as marketing_expense,
    SUM(CASE WHEN c.type = 'insurance' THEN e.amount ELSE 0 END) as insurance_expense,
    SUM(CASE WHEN c.type = 'other' THEN e.amount ELSE 0 END) as other_expense,
    SUM(CASE WHEN e.is_hometax_synced THEN e.amount ELSE 0 END) as hometax_tracked_expense,
    COUNT(*) as expense_count
  FROM expense_records e
  JOIN expense_categories c ON e.category_id = c.id
  GROUP BY e.clinic_id, e.year, e.month
),
monthly_tax AS (
  SELECT
    clinic_id,
    year,
    month,
    income_tax,
    local_income_tax,
    vat,
    total_tax,
    government_support,
    actual_tax_paid
  FROM tax_records
)
SELECT
  COALESCE(r.clinic_id, e.clinic_id, t.clinic_id) as clinic_id,
  COALESCE(r.year, e.year, t.year) as year,
  COALESCE(r.month, e.month, t.month) as month,

  -- 수입
  COALESCE(r.insurance_revenue, 0) as insurance_revenue,
  COALESCE(r.non_insurance_revenue, 0) as non_insurance_revenue,
  COALESCE(r.other_revenue, 0) as other_revenue,
  COALESCE(r.total_revenue, 0) as total_revenue,

  -- 지출
  COALESCE(e.total_expense, 0) as total_expense,
  COALESCE(e.personnel_expense, 0) as personnel_expense,
  COALESCE(e.rent_expense, 0) as rent_expense,
  COALESCE(e.utilities_expense, 0) as utilities_expense,
  COALESCE(e.material_expense, 0) as material_expense,
  COALESCE(e.lab_expense, 0) as lab_expense,
  COALESCE(e.equipment_expense, 0) as equipment_expense,
  COALESCE(e.marketing_expense, 0) as marketing_expense,
  COALESCE(e.insurance_expense, 0) as insurance_expense,
  COALESCE(e.other_expense, 0) as other_expense,
  COALESCE(e.hometax_tracked_expense, 0) as hometax_tracked_expense,

  -- 세금
  COALESCE(t.income_tax, 0) as income_tax,
  COALESCE(t.local_income_tax, 0) as local_income_tax,
  COALESCE(t.total_tax, 0) as total_tax,
  COALESCE(t.government_support, 0) as government_support,
  COALESCE(t.actual_tax_paid, 0) as actual_tax_paid,

  -- 손익 계산
  COALESCE(r.total_revenue, 0) - COALESCE(e.total_expense, 0) as pre_tax_profit,
  COALESCE(r.total_revenue, 0) - COALESCE(e.total_expense, 0) - COALESCE(t.actual_tax_paid, 0) + COALESCE(t.government_support, 0) as post_tax_profit,

  -- 수익률
  CASE
    WHEN COALESCE(r.total_revenue, 0) > 0
    THEN ((COALESCE(r.total_revenue, 0) - COALESCE(e.total_expense, 0)) / COALESCE(r.total_revenue, 0)) * 100
    ELSE 0
  END as profit_margin_percent

FROM monthly_revenue r
FULL OUTER JOIN monthly_expenses e ON r.clinic_id = e.clinic_id AND r.year = e.year AND r.month = e.month
FULL OUTER JOIN monthly_tax t ON COALESCE(r.clinic_id, e.clinic_id) = t.clinic_id
  AND COALESCE(r.year, e.year) = t.year
  AND COALESCE(r.month, e.month) = t.month;

COMMENT ON VIEW financial_summary_view IS '월별 재무 요약 뷰 (수입, 지출, 세금, 손익)';

-- ============================================
-- 7. 인덱스 생성
-- ============================================
CREATE INDEX idx_expense_categories_clinic_id ON expense_categories(clinic_id);
CREATE INDEX idx_expense_categories_type ON expense_categories(type);

CREATE INDEX idx_revenue_records_clinic_id ON revenue_records(clinic_id);
CREATE INDEX idx_revenue_records_year_month ON revenue_records(year, month);
CREATE INDEX idx_revenue_records_clinic_year_month ON revenue_records(clinic_id, year, month);

CREATE INDEX idx_expense_records_clinic_id ON expense_records(clinic_id);
CREATE INDEX idx_expense_records_category_id ON expense_records(category_id);
CREATE INDEX idx_expense_records_year_month ON expense_records(year, month);
CREATE INDEX idx_expense_records_clinic_year_month ON expense_records(clinic_id, year, month);

CREATE INDEX idx_payroll_expense_links_clinic_id ON payroll_expense_links(clinic_id);
CREATE INDEX idx_payroll_expense_links_year_month ON payroll_expense_links(year, month);

CREATE INDEX idx_tax_records_clinic_id ON tax_records(clinic_id);
CREATE INDEX idx_tax_records_year_month ON tax_records(year, month);
CREATE INDEX idx_tax_records_clinic_year_month ON tax_records(clinic_id, year, month);

-- ============================================
-- 8. RLS 정책 설정
-- ============================================

-- RLS 활성화
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_expense_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_records ENABLE ROW LEVEL SECURITY;

-- expense_categories RLS 정책
CREATE POLICY "Clinic data isolation for expense_categories" ON expense_categories
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- revenue_records RLS 정책
CREATE POLICY "Clinic data isolation for revenue_records" ON revenue_records
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- expense_records RLS 정책
CREATE POLICY "Clinic data isolation for expense_records" ON expense_records
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- payroll_expense_links RLS 정책
CREATE POLICY "Clinic data isolation for payroll_expense_links" ON payroll_expense_links
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- tax_records RLS 정책
CREATE POLICY "Clinic data isolation for tax_records" ON tax_records
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- ============================================
-- 9. 트리거 설정 (updated_at 자동 업데이트)
-- ============================================

CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_revenue_records_updated_at
    BEFORE UPDATE ON revenue_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_records_updated_at
    BEFORE UPDATE ON expense_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_records_updated_at
    BEFORE UPDATE ON tax_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. 기본 지출 카테고리 삽입 함수
-- ============================================
CREATE OR REPLACE FUNCTION create_default_expense_categories(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO expense_categories (clinic_id, name, type, description, is_hometax_trackable, is_recurring, is_system_default, display_order)
  VALUES
    (p_clinic_id, '직원 급여', 'personnel', '직원 월급 및 상여금', false, true, true, 1),
    (p_clinic_id, '4대보험 사업자부담', 'personnel', '국민연금, 건강보험, 고용보험, 산재보험 사업자 부담분', false, true, true, 2),
    (p_clinic_id, '건물 임대료', 'rent', '월 임대료', true, true, true, 3),
    (p_clinic_id, '건물 관리비', 'utilities', '관리비 (전기, 수도, 가스 포함)', true, true, true, 4),
    (p_clinic_id, '전기세', 'utilities', '전기 요금', true, true, true, 5),
    (p_clinic_id, '수도세', 'utilities', '수도 요금', true, true, true, 6),
    (p_clinic_id, '기공비', 'lab', '기공소 외주 비용 (보철물 제작 등)', true, false, true, 7),
    (p_clinic_id, '치과 재료비', 'material', '진료 재료, 소모품', true, false, true, 8),
    (p_clinic_id, '장비 유지보수', 'equipment', '의료 장비 유지보수 비용', true, false, true, 9),
    (p_clinic_id, '광고/마케팅비', 'marketing', '온라인 광고, 홍보물 제작 등', true, false, true, 10),
    (p_clinic_id, '업무용 보험료', 'insurance', '의료배상책임보험 등', true, true, true, 11),
    (p_clinic_id, '기타 비용', 'other', '기타 경비', false, false, true, 12)
  ON CONFLICT (clinic_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_default_expense_categories IS '병원에 기본 지출 카테고리 생성';

-- ============================================
-- 11. 종합소득세 계산 함수
-- ============================================
CREATE OR REPLACE FUNCTION calculate_income_tax(p_taxable_income DECIMAL)
RETURNS TABLE (
  income_tax DECIMAL,
  local_income_tax DECIMAL,
  total_tax DECIMAL,
  effective_rate DECIMAL
) AS $$
DECLARE
  v_income_tax DECIMAL := 0;
  v_local_income_tax DECIMAL := 0;
BEGIN
  -- 2025년 종합소득세 세율표 (누진세)
  -- 1,400만원 이하: 6%
  -- 1,400만원 초과 ~ 5,000만원 이하: 15% (누진공제 126만원)
  -- 5,000만원 초과 ~ 8,800만원 이하: 24% (누진공제 576만원)
  -- 8,800만원 초과 ~ 1.5억원 이하: 35% (누진공제 1,544만원)
  -- 1.5억원 초과 ~ 3억원 이하: 38% (누진공제 1,994만원)
  -- 3억원 초과 ~ 5억원 이하: 40% (누진공제 2,594만원)
  -- 5억원 초과 ~ 10억원 이하: 42% (누진공제 3,594만원)
  -- 10억원 초과: 45% (누진공제 6,594만원)

  IF p_taxable_income <= 0 THEN
    RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;

  IF p_taxable_income <= 14000000 THEN
    v_income_tax := p_taxable_income * 0.06;
  ELSIF p_taxable_income <= 50000000 THEN
    v_income_tax := p_taxable_income * 0.15 - 1260000;
  ELSIF p_taxable_income <= 88000000 THEN
    v_income_tax := p_taxable_income * 0.24 - 5760000;
  ELSIF p_taxable_income <= 150000000 THEN
    v_income_tax := p_taxable_income * 0.35 - 15440000;
  ELSIF p_taxable_income <= 300000000 THEN
    v_income_tax := p_taxable_income * 0.38 - 19940000;
  ELSIF p_taxable_income <= 500000000 THEN
    v_income_tax := p_taxable_income * 0.40 - 25940000;
  ELSIF p_taxable_income <= 1000000000 THEN
    v_income_tax := p_taxable_income * 0.42 - 35940000;
  ELSE
    v_income_tax := p_taxable_income * 0.45 - 65940000;
  END IF;

  -- 최소 0원
  v_income_tax := GREATEST(0, v_income_tax);

  -- 지방소득세 (소득세의 10%)
  v_local_income_tax := v_income_tax * 0.10;

  RETURN QUERY SELECT
    ROUND(v_income_tax, 0)::DECIMAL,
    ROUND(v_local_income_tax, 0)::DECIMAL,
    ROUND(v_income_tax + v_local_income_tax, 0)::DECIMAL,
    CASE WHEN p_taxable_income > 0
      THEN ROUND(((v_income_tax + v_local_income_tax) / p_taxable_income) * 100, 2)
      ELSE 0
    END::DECIMAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_income_tax IS '과세소득 기준 종합소득세 및 지방소득세 계산 (2025년 세율 기준)';

-- ============================================
-- 12. Storage 버킷 생성 (수입 증빙 파일용)
-- ============================================
-- Note: Supabase Dashboard에서 수동으로 생성 필요
-- 버킷명: financial-documents
-- 공개: 비공개
-- 파일 크기 제한: 10MB
-- 허용 MIME 타입: image/*, application/pdf, application/vnd.ms-excel,
--                 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

-- ============================================
-- Migration Complete
-- ============================================
