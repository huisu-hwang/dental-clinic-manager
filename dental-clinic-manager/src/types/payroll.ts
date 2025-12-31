/**
 * Types for Payroll Statement Management System
 * 급여 명세서 관리 시스템 타입 정의
 */

// =====================================================================
// 급여 유형 (세전/세후)
// =====================================================================

export type SalaryType = 'gross' | 'net' // gross: 세전, net: 세후

// =====================================================================
// 지급 항목 (Payment Items)
// =====================================================================

export interface PaymentItems {
  baseSalary: number         // 기본급
  bonus?: number             // 상여
  mealAllowance?: number     // 식대 (비과세)
  vehicleAllowance?: number  // 자가운전 보조금 (비과세)
  annualLeaveAllowance?: number // 연차수당
  additionalPay?: number     // 추가급여
  overtimePay?: number       // 초과근무수당
  otherAllowances?: Record<string, number> // 기타 수당
}

// =====================================================================
// 공제 항목 (Deduction Items)
// =====================================================================

export interface DeductionItems {
  nationalPension: number      // 국민연금
  healthInsurance: number      // 건강보험
  longTermCare: number         // 장기요양보험료
  employmentInsurance: number  // 고용보험
  incomeTax: number            // 소득세
  localIncomeTax: number       // 지방소득세
  otherDeductions?: number     // 기타공제액
  healthInsuranceAdjustment?: number    // 건강보험료정산
  longTermCareAdjustment?: number       // 장기요양보험료정산
  agricultureTax?: number      // 농특세
}

// =====================================================================
// 4대보험 설정 (Social Insurance Settings)
// =====================================================================

export interface SocialInsuranceSettings {
  nationalPension: number      // 국민연금 (월 고정)
  healthInsurance: number      // 건강보험 (월 고정)
  longTermCare: number         // 장기요양보험료 (월 고정)
  employmentInsurance: number  // 고용보험 (월 고정)
  // 보험료는 1월에 결정되어 연말까지 유지되므로 고정값 사용
  effectiveYear: number        // 적용 연도
}

// =====================================================================
// 근무 정보 (Work Information)
// =====================================================================

export interface WorkInfo {
  workDays?: number            // 근로일수
  totalWorkHours?: number      // 총 근로시간수
  overtimeHours?: number       // 연장근로시간수
  nightWorkHours?: number      // 야간근로시간수
  holidayWorkHours?: number    // 휴일근로시간수
  hourlyRate?: number          // 통상시급(원)
  familyCount?: number         // 가족수 (소득세 계산용)
  childCount?: number          // 8세이상 20세이하 자녀수 (소득세 공제용)
}

// =====================================================================
// 급여 명세서 (Payroll Statement)
// =====================================================================

export interface PayrollStatement {
  id?: string
  clinicId: string
  employeeId: string

  // 기본 정보
  statementYear: number        // 명세서 연도
  statementMonth: number       // 명세서 월
  paymentDate: string          // 지급일 (YYYY-MM-DD)

  // 직원 정보
  employeeName: string
  employeeResidentNumber?: string  // 주민번호 (일부 표시: 940707-*******)
  hireDate?: string            // 입사일
  department?: string          // 부서
  position?: string            // 직위

  // 급여 유형
  salaryType: SalaryType       // 세전/세후 계약

  // 지급 항목
  payments: PaymentItems
  totalPayment: number         // 지급액계

  // 공제 항목
  deductions: DeductionItems
  totalDeduction: number       // 공제액계

  // 실수령액
  netPay: number               // 실수령액

  // 근무 정보
  workInfo?: WorkInfo

  // 비과세 항목 합계 (소득세 계산에서 제외)
  nonTaxableTotal: number

  // 4대보험 설정
  insuranceSettings?: SocialInsuranceSettings

  // 메타데이터
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  notes?: string
}

// =====================================================================
// 직원 급여 정보 (Employee Salary Info from Contract)
// =====================================================================

export interface EmployeeSalaryInfo {
  employeeId: string
  employeeName: string
  employeeResidentNumber?: string
  hireDate?: string

  // 근로계약서에서 가져온 정보
  salaryType: SalaryType
  baseSalary: number
  mealAllowance?: number
  otherAllowances?: Record<string, number>

  // 4대보험 설정 (처음 입력 후 필요시 변경)
  insuranceSettings?: SocialInsuranceSettings

  // 가족 정보 (소득세 계산용)
  familyCount: number
  childCount: number  // 8세이상 20세이하 자녀수
}

// =====================================================================
// 급여 계산 입력 (Payroll Calculation Input)
// =====================================================================

export interface PayrollCalculationInput {
  salaryType: SalaryType
  targetAmount: number         // 세전 또는 세후 목표 금액

  // 비과세 항목
  mealAllowance?: number       // 식대 (월 20만원까지 비과세)
  vehicleAllowance?: number    // 자가운전 보조금 (월 20만원까지 비과세)

  // 4대보험
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number

  // 소득세 계산용
  familyCount: number
  childCount: number

  // 추가 지급/공제
  bonus?: number
  overtimePay?: number
  otherAllowances?: Record<string, number>
  otherDeductions?: number
}

// =====================================================================
// 급여 계산 결과 (Payroll Calculation Result)
// =====================================================================

export interface PayrollCalculationResult {
  // 지급 항목
  payments: PaymentItems
  totalPayment: number

  // 공제 항목
  deductions: DeductionItems
  totalDeduction: number

  // 최종 금액
  netPay: number

  // 비과세 합계
  nonTaxableTotal: number

  // 과세 대상 금액
  taxableIncome: number
}

// =====================================================================
// 간이세액표 조회 파라미터
// =====================================================================

export interface TaxLookupParams {
  monthlyIncome: number        // 월 급여 (비과세 제외)
  familyCount: number          // 공제대상 가족 수 (본인 포함)
  childCount: number           // 8세이상 20세이하 자녀 수
}

// =====================================================================
// 폼 상태 타입
// =====================================================================

export interface PayrollFormState {
  selectedEmployeeId: string | null
  selectedYear: number
  selectedMonth: number
  salaryType: SalaryType
  targetAmount: number

  // 지급 항목
  baseSalary: number
  bonus: number
  mealAllowance: number
  vehicleAllowance: number
  annualLeaveAllowance: number
  additionalPay: number
  overtimePay: number

  // 4대보험
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number

  // 기타 공제
  otherDeductions: number

  // 소득세 관련
  familyCount: number
  childCount: number

  // 근무 정보
  workDays: number
  totalWorkHours: number
  overtimeHours: number
  nightWorkHours: number
  holidayWorkHours: number
  hourlyRate: number
}

// =====================================================================
// 기본값
// =====================================================================

export const DEFAULT_PAYROLL_FORM_STATE: PayrollFormState = {
  selectedEmployeeId: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  salaryType: 'net',
  targetAmount: 0,

  baseSalary: 0,
  bonus: 0,
  mealAllowance: 200000, // 기본 식대 20만원
  vehicleAllowance: 0,
  annualLeaveAllowance: 0,
  additionalPay: 0,
  overtimePay: 0,

  nationalPension: 0,
  healthInsurance: 0,
  longTermCare: 0,
  employmentInsurance: 0,

  otherDeductions: 0,

  familyCount: 1, // 본인
  childCount: 0,

  workDays: 0,
  totalWorkHours: 0,
  overtimeHours: 0,
  nightWorkHours: 0,
  holidayWorkHours: 0,
  hourlyRate: 0
}

// 비과세 한도
export const NON_TAXABLE_LIMITS = {
  mealAllowance: 200000,      // 식대 월 20만원
  vehicleAllowance: 200000,   // 자가운전 보조금 월 20만원
}
