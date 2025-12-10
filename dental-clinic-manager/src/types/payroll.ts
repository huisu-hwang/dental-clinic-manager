/**
 * 급여 명세서 시스템 타입 정의
 */

// =====================================================================
// 급여 설정 타입
// =====================================================================

export type SalaryType = 'gross' | 'net' // 세전(gross) 또는 세후(net)

export type PayrollStatementStatus = 'draft' | 'confirmed' | 'sent' | 'viewed'

export type KakaoLogStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface Allowances {
  [key: string]: number // { "식대": 100000, "교통비": 50000 }
}

export interface PayrollSetting {
  id: string
  clinic_id: string
  employee_user_id: string

  // 급여 기준 설정
  salary_type: SalaryType
  base_salary: number

  // 수당 항목
  allowances: Allowances

  // 급여일 설정
  payment_day: number

  // 4대보험 설정
  national_pension: boolean
  health_insurance: boolean
  long_term_care: boolean
  employment_insurance: boolean

  // 소득세 설정
  income_tax_enabled: boolean
  dependents_count: number

  // 카카오톡 발송 설정
  kakao_notification_enabled: boolean
  kakao_phone_number?: string

  // 메모
  notes?: string

  // 메타데이터
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string

  // Relations (populated when queried with joins)
  employee?: {
    id: string
    name: string
    email?: string
    phone?: string
    role?: string
  }
}

// =====================================================================
// 급여 명세서 타입
// =====================================================================

export interface OtherDeductions {
  [key: string]: number // { "선급금 상환": 50000 }
}

export interface PayrollStatement {
  id: string
  clinic_id: string
  employee_user_id: string
  payroll_setting_id?: string

  // 급여 기간
  payment_year: number
  payment_month: number
  payment_date: string

  // 지급 항목
  base_salary: number
  allowances: Allowances
  overtime_pay: number
  bonus: number
  other_earnings: number
  total_earnings: number

  // 공제 항목
  national_pension: number
  health_insurance: number
  long_term_care: number
  employment_insurance: number
  income_tax: number
  local_income_tax: number
  other_deductions: OtherDeductions
  total_deductions: number

  // 실수령액
  net_pay: number

  // 근태 정보
  work_days: number
  overtime_hours: number
  leave_days: number

  // 상태
  status: PayrollStatementStatus
  confirmed_at?: string
  confirmed_by?: string
  sent_at?: string
  viewed_at?: string

  // 메모
  notes?: string

  // 메타데이터
  created_at: string
  updated_at: string
  created_by?: string

  // Relations (populated when queried with joins)
  employee?: {
    id: string
    name: string
    email?: string
    phone?: string
    role?: string
  }
  payroll_setting?: PayrollSetting
}

// =====================================================================
// 카카오톡 발송 로그 타입
// =====================================================================

export interface PayrollKakaoLog {
  id: string
  payroll_statement_id: string
  phone_number: string
  template_code?: string
  message_content?: string
  status: KakaoLogStatus
  sent_at?: string
  delivered_at?: string
  error_message?: string
  created_at: string
  created_by?: string
}

// =====================================================================
// 4대보험 및 세금 계산 관련 타입
// =====================================================================

export interface InsuranceRates {
  nationalPension: number      // 국민연금 요율 (4.5%)
  healthInsurance: number      // 건강보험 요율 (3.545%)
  longTermCare: number         // 장기요양보험 요율 (건강보험의 12.95%)
  employmentInsurance: number  // 고용보험 요율 (0.9%)
}

export interface DeductionCalculation {
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number
  incomeTax: number
  localIncomeTax: number
  totalDeductions: number
}

export interface PayrollCalculation {
  totalEarnings: number
  deductions: DeductionCalculation
  netPay: number
}

// =====================================================================
// 폼 및 필터 타입
// =====================================================================

export interface PayrollSettingFormData {
  employee_user_id: string
  salary_type: SalaryType
  base_salary: number
  allowances: Allowances
  payment_day: number
  national_pension: boolean
  health_insurance: boolean
  long_term_care: boolean
  employment_insurance: boolean
  income_tax_enabled: boolean
  dependents_count: number
  kakao_notification_enabled: boolean
  kakao_phone_number?: string
  notes?: string
}

export interface PayrollStatementFormData {
  employee_user_id: string
  payment_year: number
  payment_month: number
  payment_date: string
  base_salary: number
  allowances: Allowances
  overtime_pay?: number
  bonus?: number
  other_earnings?: number
  other_deductions?: OtherDeductions
  work_days?: number
  overtime_hours?: number
  leave_days?: number
  notes?: string
}

export interface PayrollStatementFilters {
  employee_user_id?: string
  payment_year?: number
  payment_month?: number
  status?: PayrollStatementStatus | PayrollStatementStatus[]
  date_from?: string
  date_to?: string
}

// =====================================================================
// API 응답 타입
// =====================================================================

export interface GetPayrollSettingsResponse {
  success: boolean
  data?: PayrollSetting[]
  error?: string
}

export interface GetPayrollSettingResponse {
  success: boolean
  data?: PayrollSetting
  error?: string
}

export interface SavePayrollSettingResponse {
  success: boolean
  data?: PayrollSetting
  error?: string
}

export interface GetPayrollStatementsResponse {
  success: boolean
  data?: PayrollStatement[]
  total?: number
  error?: string
}

export interface GetPayrollStatementResponse {
  success: boolean
  data?: PayrollStatement
  error?: string
}

export interface GeneratePayrollStatementsResponse {
  success: boolean
  count?: number
  error?: string
}

export interface SendKakaoNotificationResponse {
  success: boolean
  log?: PayrollKakaoLog
  error?: string
}

// =====================================================================
// 한국 4대보험 요율 상수 (2024년 기준)
// =====================================================================

export const INSURANCE_RATES: InsuranceRates = {
  nationalPension: 0.045,      // 국민연금 4.5%
  healthInsurance: 0.03545,    // 건강보험 3.545%
  longTermCare: 0.1295,        // 장기요양보험 (건강보험의 12.95%)
  employmentInsurance: 0.009,  // 고용보험 0.9%
}

// =====================================================================
// 유틸리티 타입
// =====================================================================

export interface AllowanceItem {
  name: string
  amount: number
}

export interface DeductionItem {
  name: string
  amount: number
}

// 공통 수당 항목
export const COMMON_ALLOWANCES = [
  '식대',
  '교통비',
  '자가운전보조금',
  '자녀보육수당',
  '직책수당',
  '자격수당',
  '근속수당',
  '가족수당',
  '야간수당',
  '휴일수당'
] as const

// =====================================================================
// 비과세 수당 관련 타입 및 상수
// =====================================================================

// 비과세 수당 타입
export type NonTaxableAllowanceType =
  | 'meal'           // 식대
  | 'vehicle'        // 자가운전보조금
  | 'childcare'      // 자녀보육수당
  | 'none'           // 과세 (비과세 아님)

// 비과세 수당 한도 (월 기준, 원)
export const NON_TAXABLE_LIMITS: Record<Exclude<NonTaxableAllowanceType, 'none'>, number> = {
  meal: 200000,           // 식대: 월 20만원 한도
  vehicle: 200000,        // 자가운전보조금: 월 20만원 한도
  childcare: 200000,      // 자녀보육수당: 월 20만원 한도 (6세 이하 자녀)
}

// 수당명과 비과세 타입 매핑
export const ALLOWANCE_TO_NON_TAXABLE_TYPE: Record<string, NonTaxableAllowanceType> = {
  '식대': 'meal',
  '자가운전보조금': 'vehicle',
  '자녀보육수당': 'childcare',
}

// 비과세 타입 레이블
export const NON_TAXABLE_TYPE_LABELS: Record<NonTaxableAllowanceType, string> = {
  meal: '식대 (월 20만원 한도)',
  vehicle: '자가운전보조금 (월 20만원 한도)',
  childcare: '자녀보육수당 (월 20만원 한도)',
  none: '과세',
}

// 수당 항목 타입 (비과세 정보 포함)
export interface AllowanceWithTaxInfo {
  name: string
  amount: number
  nonTaxableType: NonTaxableAllowanceType
}

// 비과세 금액 계산 결과
export interface NonTaxableCalculation {
  totalNonTaxable: number       // 총 비과세 금액
  taxableEarnings: number       // 과세 대상 금액
  nonTaxableDetails: {          // 비과세 상세 내역
    type: NonTaxableAllowanceType
    name: string
    amount: number
    nonTaxableAmount: number
    taxableAmount: number
  }[]
}

// 급여 상태 레이블
export const STATUS_LABELS: Record<PayrollStatementStatus, string> = {
  draft: '작성중',
  confirmed: '확정됨',
  sent: '발송완료',
  viewed: '확인완료'
}

// 급여 타입 레이블
export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  gross: '세전',
  net: '세후'
}
