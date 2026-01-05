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

// =====================================================================
// 근태 연동 급여 차감 관련 타입 (대한민국 근로기준법 기반)
// =====================================================================

/**
 * 급여 차감 사유 유형
 * - absent: 무단결근 (해당일 급여 + 주휴수당 차감)
 * - late: 지각 (해당 시간만큼 급여 차감)
 * - early_leave: 조퇴 (해당 시간만큼 급여 차감)
 * - excess_leave: 연차 초과 사용 (초과 일수 × 일급 차감)
 */
export type DeductionReason = 'absent' | 'late' | 'early_leave' | 'excess_leave'

/**
 * 급여 차감 상세 항목
 */
export interface DeductionDetail {
  reason: DeductionReason
  description: string          // 차감 사유 상세 설명
  count?: number               // 횟수 (결근일수, 연차 초과일수 등)
  minutes?: number             // 시간(분) (지각/조퇴 시간)
  amount: number               // 차감 금액
  weeklyHolidayPayDeducted?: boolean // 주휴수당 차감 여부 (무단결근 시)
}

/**
 * 근태 기반 급여 차감 요약
 */
export interface AttendanceDeduction {
  // 근무 기본 정보
  scheduledWorkDays: number    // 소정 근로일수 (해당 월 예정 근무일)
  actualWorkDays: number       // 실제 근무일수

  // 결근 정보
  absentDays: number           // 무단결근 일수
  absentDeduction: number      // 결근 차감액 (일급 × 결근일수)
  weeklyHolidayPayDeduction: number // 주휴수당 차감액

  // 지각 정보
  lateCount: number            // 지각 횟수
  totalLateMinutes: number     // 총 지각 시간 (분)
  lateDeduction: number        // 지각 차감액

  // 조퇴 정보
  earlyLeaveCount: number      // 조퇴 횟수
  totalEarlyLeaveMinutes: number // 총 조퇴 시간 (분)
  earlyLeaveDeduction: number  // 조퇴 차감액

  // 연차 정보
  usedLeaves: number           // 사용 연차
  allowedLeaves: number        // 허용 연차 (잔여 연차)
  excessLeaves: number         // 초과 사용 연차
  excessLeaveDeduction: number // 연차 초과 차감액

  // 총 차감
  totalDeduction: number       // 근태 관련 총 차감액

  // 차감 상세 내역
  deductionDetails: DeductionDetail[]
}

/**
 * 급여 계산용 근태 요약 정보
 */
export interface AttendanceSummaryForPayroll {
  // 기본 정보
  userId: string
  year: number
  month: number

  // 근무 일수
  totalWorkDays: number        // 해당 월 총 소정 근로일수
  presentDays: number          // 출근 일수 (정상 + 지각 + 조퇴)
  absentDays: number           // 결근 일수 (무단결근)
  leaveDays: number            // 연차 사용 일수
  holidayDays: number          // 공휴일/휴일 일수

  // 지각/조퇴 상세
  lateCount: number            // 지각 횟수
  totalLateMinutes: number     // 총 지각 시간 (분)
  earlyLeaveCount: number      // 조퇴 횟수
  totalEarlyLeaveMinutes: number // 총 조퇴 시간 (분)

  // 초과근무
  overtimeMinutes: number      // 연장근로 시간 (분)
  nightWorkMinutes: number     // 야간근로 시간 (분)
  holidayWorkMinutes: number   // 휴일근로 시간 (분)

  // 연차 정보
  allowedAnnualLeave: number   // 연간 부여 연차
  usedAnnualLeave: number      // 연간 사용 연차
  remainingAnnualLeave: number // 잔여 연차
}

/**
 * 급여 계산 기준 정보
 * 월급제 근로자의 일급/시급 계산에 사용
 */
export interface PayrollBasis {
  monthlyBaseSalary: number    // 월 기본급
  monthlyWorkDays: number      // 월 소정 근로일수 (통상 약 21.75일)
  dailyWorkHours: number       // 일 소정 근로시간 (통상 8시간)
  monthlyWorkHours: number     // 월 소정 근로시간 (통상 209시간)
  dailyWage: number            // 일급 (월급 ÷ 월 소정 근로일수)
  hourlyWage: number           // 통상시급 (월급 ÷ 209시간)
  weeklyHolidayPay: number     // 주휴수당 (주당)
}

/**
 * 근태 기반 급여 계산 입력
 */
export interface AttendancePayrollInput {
  employeeId: string
  year: number
  month: number
  baseSalary: number           // 월 기본급 (비과세 제외)
  includeWeeklyHolidayPay?: boolean // 주휴수당 포함 여부 (월급제는 보통 포함)
  allowedAnnualLeave?: number  // 허용 연차 (잔여 연차)
  // 근태 차감/수당 옵션
  deductLateMinutes?: boolean  // 지각 시간 급여 차감 여부 (기본: true)
  deductEarlyLeaveMinutes?: boolean // 조퇴 시간 급여 차감 여부 (기본: true)
  includeOvertimePay?: boolean // 초과근무 수당 포함 여부 (기본: true)
}

/**
 * 근태 기반 급여 계산 결과
 */
export interface AttendancePayrollResult {
  basis: PayrollBasis          // 급여 계산 기준
  attendance: AttendanceSummaryForPayroll // 근태 요약
  deduction: AttendanceDeduction // 차감 내역
  adjustedBaseSalary: number   // 조정된 기본급 (차감 후)
  overtimePay: number          // 초과근무수당
  nightWorkPay: number         // 야간근무수당
  holidayWorkPay: number       // 휴일근무수당
}

/**
 * 급여 명세서 접근 권한 결과
 */
export interface PayrollAccessResult {
  canAccess: boolean           // 접근 가능 여부
  reason?: string              // 접근 불가 사유
  availableDate?: string       // 접근 가능 일자 (YYYY-MM-DD)
}

/**
 * 확장된 급여 명세서 (근태 연동 포함)
 */
export interface PayrollStatementWithAttendance extends PayrollStatement {
  attendanceSummary?: AttendanceSummaryForPayroll
  attendanceDeduction?: AttendanceDeduction
}
