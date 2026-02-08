// ============================================
// 경영 현황 관리 타입 정의
// Created: 2026-02-06
// ============================================

// 지출 카테고리 타입
export type ExpenseCategoryType =
  | 'personnel'   // 인건비
  | 'rent'        // 임대료
  | 'utilities'   // 관리비 (전기, 수도, 가스)
  | 'material'    // 재료비
  | 'lab'         // 기공비
  | 'equipment'   // 장비/유지보수
  | 'marketing'   // 광고/마케팅
  | 'insurance'   // 보험료
  | 'tax'         // 세금/공과금
  | 'other';      // 기타

// 지출 카테고리 한글 매핑
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryType, string> = {
  personnel: '인건비',
  rent: '임대료',
  utilities: '관리비',
  material: '재료비',
  lab: '기공비',
  equipment: '장비/유지보수',
  marketing: '광고/마케팅',
  insurance: '보험료',
  tax: '세금/공과금',
  other: '기타',
};

// 데이터 소스 타입
export type DataSourceType = 'manual' | 'excel' | 'image' | 'api';

// 데이터 소스 한글 매핑
export const DATA_SOURCE_LABELS: Record<DataSourceType, string> = {
  manual: '수동 입력',
  excel: '엑셀 업로드',
  image: '이미지 업로드',
  api: 'API 연동',
};

// 결제 방법 타입
export type PaymentMethod = 'card' | 'cash' | 'transfer' | 'auto_transfer';

// 결제 방법 한글 매핑
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: '카드',
  cash: '현금',
  transfer: '계좌이체',
  auto_transfer: '자동이체',
};

// 세금 계산 방식
export type TaxCalculationMethod = 'auto' | 'manual' | 'accountant';

// 세금 계산 방식 한글 매핑
export const TAX_CALCULATION_LABELS: Record<TaxCalculationMethod, string> = {
  auto: '자동 계산',
  manual: '수동 입력',
  accountant: '세무사 입력',
};

// ============================================
// 데이터베이스 테이블 인터페이스
// ============================================

// 지출 카테고리
export interface ExpenseCategory {
  id: string;
  clinic_id: string;
  name: string;
  type: ExpenseCategoryType;
  description: string | null;
  is_hometax_trackable: boolean;
  is_recurring: boolean;
  is_system_default: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 수입 기록
export interface RevenueRecord {
  id: string;
  clinic_id: string;
  year: number;
  month: number;
  insurance_revenue: number;
  insurance_patient_count: number;
  non_insurance_revenue: number;
  non_insurance_patient_count: number;
  other_revenue: number;
  other_revenue_description: string | null;
  total_revenue: number;
  source_type: DataSourceType;
  source_file_url: string | null;
  source_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// 지출 기록
export interface ExpenseRecord {
  id: string;
  clinic_id: string;
  category_id: string;
  year: number;
  month: number;
  amount: number;
  description: string | null;
  vendor_name: string | null;
  has_tax_invoice: boolean;
  tax_invoice_number: string | null;
  tax_invoice_date: string | null;
  payment_method: PaymentMethod | null;
  is_business_card: boolean;
  is_hometax_synced: boolean;
  hometax_sync_date: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // JOIN 결과
  category?: ExpenseCategory;
}

// 세금 기록
export interface TaxRecord {
  id: string;
  clinic_id: string;
  year: number;
  month: number;
  taxable_income: number;
  income_tax: number;
  local_income_tax: number;
  vat: number;
  property_tax: number;
  other_tax: number;
  total_tax: number;
  government_support: number;
  tax_deductions: number;
  actual_tax_paid: number;
  calculation_method: TaxCalculationMethod;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// 급여-지출 연결
export interface PayrollExpenseLink {
  id: string;
  clinic_id: string;
  payroll_statement_id: string;
  expense_record_id: string;
  year: number;
  month: number;
  total_salary: number;
  employer_national_pension: number;
  employer_health_insurance: number;
  employer_employment_insurance: number;
  employer_industrial_insurance: number;
  total_employer_insurance: number;
  created_at: string;
}

// ============================================
// 재무 요약 인터페이스
// ============================================

// 월별 재무 요약
export interface FinancialSummary {
  clinic_id: string;
  year: number;
  month: number;

  // 수입
  insurance_revenue: number;
  non_insurance_revenue: number;
  other_revenue: number;
  total_revenue: number;

  // 지출
  total_expense: number;
  personnel_expense: number;
  rent_expense: number;
  utilities_expense: number;
  material_expense: number;
  lab_expense: number;
  equipment_expense: number;
  marketing_expense: number;
  insurance_expense: number;
  other_expense: number;
  hometax_tracked_expense: number;

  // 세금
  income_tax: number;
  local_income_tax: number;
  total_tax: number;
  government_support: number;
  actual_tax_paid: number;

  // 손익
  pre_tax_profit: number;
  post_tax_profit: number;
  profit_margin_percent: number;
}

// 연간 재무 요약
export interface AnnualFinancialSummary {
  clinic_id: string;
  year: number;
  months: FinancialSummary[];
  totals: {
    total_revenue: number;
    total_expense: number;
    total_tax: number;
    pre_tax_profit: number;
    post_tax_profit: number;
    average_monthly_revenue: number;
    average_monthly_expense: number;
    average_profit_margin: number;
  };
}

// ============================================
// 폼/입력 인터페이스
// ============================================

// 수입 입력 폼
export interface RevenueFormData {
  year: number;
  month: number;
  insurance_revenue: number;
  insurance_patient_count: number;
  non_insurance_revenue: number;
  non_insurance_patient_count: number;
  other_revenue: number;
  other_revenue_description: string;
  source_type: DataSourceType;
  notes: string;
}

// 지출 입력 폼
export interface ExpenseFormData {
  category_id: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  vendor_name: string;
  has_tax_invoice: boolean;
  tax_invoice_number: string;
  tax_invoice_date: string;
  payment_method: PaymentMethod | null;
  is_business_card: boolean;
  is_hometax_synced: boolean;
  notes: string;
}

// 세금 입력 폼
export interface TaxFormData {
  year: number;
  month: number;
  taxable_income: number;
  income_tax: number;
  local_income_tax: number;
  vat: number;
  property_tax: number;
  other_tax: number;
  government_support: number;
  tax_deductions: number;
  calculation_method: TaxCalculationMethod;
  notes: string;
}

// ============================================
// 엑셀/이미지 파싱 결과 인터페이스
// ============================================

// 엑셀 파싱 결과
export interface ExcelParseResult {
  success: boolean;
  data?: {
    insurance_revenue?: number;
    non_insurance_revenue?: number;
    insurance_patient_count?: number;
    non_insurance_patient_count?: number;
    items?: Array<{
      description: string;
      amount: number;
      date?: string;
    }>;
  };
  error?: string;
  raw_data?: unknown;
}

// 이미지 OCR 결과
export interface ImageOCRResult {
  success: boolean;
  data?: {
    extracted_text: string;
    detected_amounts: Array<{
      value: number;
      context: string;
      confidence: number;
    }>;
    suggested_category?: ExpenseCategoryType;
  };
  error?: string;
}

// ============================================
// API 응답 인터페이스
// ============================================

export interface FinancialApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 종합소득세 계산 결과
export interface TaxCalculationResult {
  income_tax: number;
  local_income_tax: number;
  total_tax: number;
  effective_rate: number;
}

// ============================================
// 차트/시각화 인터페이스
// ============================================

// 수입/지출 추이 차트 데이터
export interface FinancialTrendData {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

// 지출 카테고리별 비중 차트 데이터
export interface ExpenseBreakdownData {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

// 수입 구성 차트 데이터
export interface RevenueBreakdownData {
  type: string;
  amount: number;
  percentage: number;
  color: string;
}
