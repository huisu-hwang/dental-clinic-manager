/**
 * 급여 명세서 서비스
 * 세전/세후 급여 계산, 명세서 생성 등의 비즈니스 로직
 */

import type {
  PayrollStatement,
  PayrollCalculationInput,
  PayrollCalculationResult,
  PaymentItems,
  DeductionItems,
  SalaryType,
  EmployeeSalaryInfo,
  SocialInsuranceSettings,
  PayrollFormState,
  AttendanceSummaryForPayroll,
  AttendanceDeduction,
  DeductionDetail,
  PayrollBasis,
  AttendancePayrollInput,
  AttendancePayrollResult,
  PayrollAccessResult
} from '@/types/payroll'
import {
  calculateIncomeTax,
  calculateLocalIncomeTax,
  calculateGrossFromNet,
  calculateNetFromGross,
  estimateInsurance
} from '@/utils/taxCalculationUtils'
import { createClient } from '@/lib/supabase/client'
import type { ContractData, EmploymentContract } from '@/types/contract'
import type { WorkSchedule, DayName } from '@/types/workSchedule'
import { DEFAULT_WORK_SCHEDULE, DAY_OF_WEEK_TO_NAME } from '@/types/workSchedule'
import { calculateAnnualLeaveDays } from '@/lib/leaveService'
import { getPublicHolidaySet } from '@/lib/holidayService'

// =====================================================================
// 급여 계산 함수
// =====================================================================

/**
 * 급여 명세서 계산 (세전/세후 모두 지원)
 */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const {
    salaryType,
    targetAmount,
    mealAllowance = 0,
    vehicleAllowance = 0,
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    familyCount,
    childCount,
    bonus = 0,
    overtimePay = 0,
    otherAllowances = {},
    otherDeductions = 0
  } = input

  // 비과세 금액 계산 (식대, 자가운전 보조금)
  const nonTaxableMeal = Math.min(mealAllowance, 200000)
  const nonTaxableVehicle = Math.min(vehicleAllowance, 200000)
  const nonTaxableTotal = nonTaxableMeal + nonTaxableVehicle

  // 4대보험 합계
  const insuranceTotal = nationalPension + healthInsurance + longTermCare + employmentInsurance

  // 기타 수당 합계
  const otherAllowancesTotal = Object.values(otherAllowances).reduce((sum, val) => sum + (val || 0), 0)

  let payments: PaymentItems
  let deductions: DeductionItems
  let totalPayment: number
  let totalDeduction: number
  let netPay: number
  let taxableIncome: number

  if (salaryType === 'net') {
    // 세후 계약: 실수령액에서 역산
    const { grossPay, baseSalary, incomeTax, localIncomeTax } = calculateGrossFromNet(
      targetAmount,
      insuranceTotal,
      nonTaxableTotal,
      familyCount,
      childCount,
      otherDeductions
    )

    // 지급 항목 구성
    totalPayment = grossPay + bonus + overtimePay + otherAllowancesTotal
    taxableIncome = totalPayment - nonTaxableTotal

    // 최종 세금 재계산 (추가 수당 포함)
    const finalIncomeTax = calculateIncomeTax({
      monthlyIncome: taxableIncome,
      familyCount,
      childCount
    })
    const finalLocalTax = calculateLocalIncomeTax(finalIncomeTax)

    payments = {
      baseSalary: baseSalary + bonus + overtimePay + otherAllowancesTotal - mealAllowance - vehicleAllowance,
      bonus: bonus > 0 ? bonus : undefined,
      mealAllowance: mealAllowance > 0 ? mealAllowance : undefined,
      vehicleAllowance: vehicleAllowance > 0 ? vehicleAllowance : undefined,
      overtimePay: overtimePay > 0 ? overtimePay : undefined,
      otherAllowances: Object.keys(otherAllowances).length > 0 ? otherAllowances : undefined
    }

    deductions = {
      nationalPension,
      healthInsurance,
      longTermCare,
      employmentInsurance,
      incomeTax: finalIncomeTax,
      localIncomeTax: finalLocalTax,
      otherDeductions: otherDeductions > 0 ? otherDeductions : undefined
    }

    totalDeduction = insuranceTotal + finalIncomeTax + finalLocalTax + otherDeductions
    netPay = totalPayment - totalDeduction

  } else {
    // 세전 계약: 세전 금액에서 공제액 계산
    const baseSalaryWithAllowances = targetAmount + mealAllowance + vehicleAllowance
    totalPayment = baseSalaryWithAllowances + bonus + overtimePay + otherAllowancesTotal
    taxableIncome = totalPayment - nonTaxableTotal

    const { incomeTax, localIncomeTax } = calculateNetFromGross(
      totalPayment,
      insuranceTotal,
      nonTaxableTotal,
      familyCount,
      childCount,
      otherDeductions
    )

    payments = {
      baseSalary: targetAmount,
      bonus: bonus > 0 ? bonus : undefined,
      mealAllowance: mealAllowance > 0 ? mealAllowance : undefined,
      vehicleAllowance: vehicleAllowance > 0 ? vehicleAllowance : undefined,
      overtimePay: overtimePay > 0 ? overtimePay : undefined,
      otherAllowances: Object.keys(otherAllowances).length > 0 ? otherAllowances : undefined
    }

    deductions = {
      nationalPension,
      healthInsurance,
      longTermCare,
      employmentInsurance,
      incomeTax,
      localIncomeTax,
      otherDeductions: otherDeductions > 0 ? otherDeductions : undefined
    }

    totalDeduction = insuranceTotal + incomeTax + localIncomeTax + otherDeductions
    netPay = totalPayment - totalDeduction
  }

  return {
    payments,
    totalPayment,
    deductions,
    totalDeduction,
    netPay,
    nonTaxableTotal,
    taxableIncome
  }
}

/**
 * 폼 상태에서 급여 계산
 */
export function calculatePayrollFromFormState(formState: PayrollFormState): PayrollCalculationResult {
  const input: PayrollCalculationInput = {
    salaryType: formState.salaryType,
    targetAmount: formState.targetAmount || formState.baseSalary,
    mealAllowance: formState.mealAllowance,
    vehicleAllowance: formState.vehicleAllowance,
    nationalPension: formState.nationalPension,
    healthInsurance: formState.healthInsurance,
    longTermCare: formState.longTermCare,
    employmentInsurance: formState.employmentInsurance,
    familyCount: formState.familyCount,
    childCount: formState.childCount,
    bonus: formState.bonus,
    overtimePay: formState.overtimePay,
    otherDeductions: formState.otherDeductions
  }

  return calculatePayroll(input)
}

// =====================================================================
// 근로계약서 연동 함수
// =====================================================================

/**
 * 근로계약서에서 급여 정보 추출
 */
export function extractSalaryInfoFromContract(
  contract: EmploymentContract,
  employee: { id: string; name: string; resident_registration_number?: string; hire_date?: string }
): EmployeeSalaryInfo {
  const contractData = contract.contract_data

  // 수당 정보 추출
  const allowances = contractData.salary_allowances || {}

  // 세전/세후 판단 (기본값: 세후)
  // 실제로는 계약서에 별도 필드가 필요하지만, 현재는 세후로 가정
  const salaryType: SalaryType = 'net'

  return {
    employeeId: employee.id,
    employeeName: employee.name || contractData.employee_name,
    employeeResidentNumber: employee.resident_registration_number || contractData.employee_resident_number,
    hireDate: employee.hire_date || contractData.employment_period_start,
    salaryType,
    baseSalary: contractData.salary_base || 0,
    mealAllowance: allowances['식대'] || 0,
    otherAllowances: allowances,
    familyCount: 1, // 기본값 (본인)
    childCount: 0   // 기본값
  }
}

/**
 * 직원의 완료된 근로계약서 조회
 */
export async function getEmployeeContract(
  employeeId: string,
  clinicId: string
): Promise<EmploymentContract | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('employment_contracts')
    .select('*')
    .eq('employee_user_id', employeeId)
    .eq('clinic_id', clinicId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data as EmploymentContract
}

/**
 * 직원 목록 조회 (급여 명세서용)
 */
export async function getEmployeesForPayroll(clinicId: string): Promise<{
  id: string
  name: string
  email: string
  role: string
  hire_date?: string
  resident_registration_number?: string
  hasContract: boolean
}[]> {
  const supabase = createClient()

  // 직원 목록 조회
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email, role, hire_date, resident_registration_number')
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .order('name')

  if (usersError || !users) {
    console.error('Error fetching employees:', usersError)
    return []
  }

  // 완료된 계약서가 있는지 확인
  const { data: contracts, error: contractsError } = await supabase
    .from('employment_contracts')
    .select('employee_user_id')
    .eq('clinic_id', clinicId)
    .eq('status', 'completed')

  const contractEmployeeIds = new Set(
    (contracts || []).map((c: { employee_user_id: string }) => c.employee_user_id)
  )

  return users.map((user: {
    id: string
    name: string
    email: string
    role: string
    hire_date?: string
    resident_registration_number?: string
  }) => ({
    ...user,
    hasContract: contractEmployeeIds.has(user.id)
  }))
}

// =====================================================================
// 급여 명세서 생성 및 관리
// =====================================================================

/**
 * 급여 명세서 생성
 */
export function createPayrollStatement(
  clinicId: string,
  employeeInfo: EmployeeSalaryInfo,
  year: number,
  month: number,
  paymentDate: string,
  calculationResult: PayrollCalculationResult,
  workInfo?: PayrollStatement['workInfo'],
  insuranceSettings?: SocialInsuranceSettings
): PayrollStatement {
  return {
    clinicId,
    employeeId: employeeInfo.employeeId,
    statementYear: year,
    statementMonth: month,
    paymentDate,
    employeeName: employeeInfo.employeeName,
    employeeResidentNumber: employeeInfo.employeeResidentNumber,
    hireDate: employeeInfo.hireDate,
    salaryType: employeeInfo.salaryType,
    payments: calculationResult.payments,
    totalPayment: calculationResult.totalPayment,
    deductions: calculationResult.deductions,
    totalDeduction: calculationResult.totalDeduction,
    netPay: calculationResult.netPay,
    nonTaxableTotal: calculationResult.nonTaxableTotal,
    workInfo,
    insuranceSettings,
    createdAt: new Date().toISOString()
  }
}

// =====================================================================
// 4대보험 추정치 계산 (참고용)
// =====================================================================

/**
 * 예상 4대보험료 계산 (월 급여 기준)
 * 주의: 실제 보험료는 직접 입력해야 함
 */
export function getEstimatedInsurance(monthlyGrossPay: number): SocialInsuranceSettings {
  const estimates = estimateInsurance(monthlyGrossPay)

  return {
    nationalPension: estimates.nationalPension,
    healthInsurance: estimates.healthInsurance,
    longTermCare: estimates.longTermCare,
    employmentInsurance: estimates.employmentInsurance,
    effectiveYear: new Date().getFullYear()
  }
}

// =====================================================================
// 주민번호 마스킹
// =====================================================================

/**
 * 주민번호 마스킹 (뒷자리 숨김)
 * 예: 940707-1234567 -> 940707(51)
 */
export function maskResidentNumber(residentNumber?: string): string {
  if (!residentNumber) return ''

  // 하이픈 제거하고 숫자만 추출
  const digits = residentNumber.replace(/[^0-9]/g, '')

  if (digits.length >= 7) {
    // 생년월일 (6자리) + 성별 코드 (1자리)
    const birthDate = digits.substring(0, 6)
    const genderCode = digits.charAt(6)
    return `${birthDate}(${genderCode}${digits.charAt(7) || ''})`
  }

  return residentNumber
}

/**
 * 급여 명세서용 주민번호 표시
 * 예: 940707-******* 또는 940707(51)
 */
export function formatResidentNumberForPayroll(residentNumber?: string, style: 'masked' | 'short' = 'short'): string {
  if (!residentNumber) return ''

  const digits = residentNumber.replace(/[^0-9]/g, '')

  if (style === 'masked' && digits.length >= 7) {
    return `${digits.substring(0, 6)}-*******`
  }

  return maskResidentNumber(residentNumber)
}

// =====================================================================
// 날짜 유틸리티
// =====================================================================

/**
 * 급여 지급일 계산
 * @param year 연도
 * @param month 월
 * @param paymentDay 지급일 (예: 25)
 * @returns 지급일 문자열 (YYYY-MM-DD)
 */
export function calculatePaymentDate(year: number, month: number, paymentDay: number): string {
  // 해당 월의 마지막 날 확인
  const lastDay = new Date(year, month, 0).getDate()
  const actualDay = Math.min(paymentDay, lastDay)

  const date = new Date(year, month - 1, actualDay)
  return date.toISOString().split('T')[0]
}

/**
 * 연도/월 옵션 생성
 */
export function generateYearMonthOptions(yearsBack: number = 2): {
  year: number
  month: number
  label: string
}[] {
  const options: { year: number; month: number; label: string }[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  for (let y = currentYear; y >= currentYear - yearsBack; y--) {
    const startMonth = y === currentYear ? currentMonth : 12
    const endMonth = 1

    for (let m = startMonth; m >= endMonth; m--) {
      options.push({
        year: y,
        month: m,
        label: `${y}년 ${m}월`
      })
    }
  }

  return options
}

// =====================================================================
// 급여 명세서 저장/조회/삭제 함수
// =====================================================================

/**
 * 급여 명세서 저장 (API 호출)
 */
export async function savePayrollStatement(
  statement: PayrollStatement,
  createdBy: string
): Promise<{ success: boolean; data?: PayrollStatement; message?: string; error?: string }> {
  try {
    const response = await fetch('/api/payroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...statement,
        createdBy
      }),
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error saving payroll statement:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.'
    }
  }
}

/**
 * 급여 명세서 목록 조회
 */
export async function getPayrollStatements(
  clinicId: string,
  filters?: {
    employeeId?: string
    year?: number
    month?: number
  }
): Promise<{ success: boolean; data?: PayrollStatement[]; error?: string }> {
  try {
    const params = new URLSearchParams({ clinicId })
    if (filters?.employeeId) params.append('employeeId', filters.employeeId)
    if (filters?.year) params.append('year', filters.year.toString())
    if (filters?.month) params.append('month', filters.month.toString())

    const response = await fetch(`/api/payroll?${params.toString()}`)
    const result = await response.json()

    if (result.success && result.data) {
      // snake_case를 camelCase로 변환 (기존 테이블 컬럼명에 맞춤)
      const statements = result.data.map((item: Record<string, unknown>) => ({
        id: item.id,
        clinicId: item.clinic_id,
        employeeId: item.employee_user_id,
        statementYear: item.payment_year,
        statementMonth: item.payment_month,
        paymentDate: item.payment_date,
        employeeName: item.employee_name,
        employeeResidentNumber: item.employee_resident_number,
        hireDate: item.hire_date,
        salaryType: item.salary_type,
        payments: item.payments,
        totalPayment: item.total_payment,
        deductions: item.deductions,
        totalDeduction: item.total_deduction,
        netPay: item.net_pay,
        nonTaxableTotal: item.non_taxable_total,
        workInfo: item.work_info,
        insuranceSettings: item.insurance_settings,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        createdBy: item.created_by
      }))
      return { success: true, data: statements }
    }

    return result
  } catch (error) {
    console.error('Error fetching payroll statements:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '조회 중 오류가 발생했습니다.'
    }
  }
}

/**
 * 특정 직원의 특정 연월 급여 명세서 조회
 */
export async function getPayrollStatement(
  clinicId: string,
  employeeId: string,
  year: number,
  month: number
): Promise<PayrollStatement | null> {
  const result = await getPayrollStatements(clinicId, { employeeId, year, month })
  if (result.success && result.data && result.data.length > 0) {
    return result.data[0]
  }
  return null
}

/**
 * 급여 명세서 삭제
 */
export async function deletePayrollStatement(
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`/api/payroll?id=${id}`, {
      method: 'DELETE',
    })

    return await response.json()
  } catch (error) {
    console.error('Error deleting payroll statement:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.'
    }
  }
}

// =====================================================================
// 근태 연동 급여 계산 함수 (대한민국 근로기준법 기반)
// =====================================================================

/**
 * 기준 월 소정 근로시간 상수 (주 40시간 기준 209시간)
 * 주 40시간 × (365일 ÷ 7일 ÷ 12개월) + 주휴 8시간 = 약 209시간
 */
const STANDARD_MONTHLY_WORK_HOURS = 209

/**
 * 기준 주 소정 근로시간 (40시간)
 */
const STANDARD_WEEKLY_WORK_HOURS = 40

/**
 * 근무 스케줄에서 주간 근로시간 계산
 * @param schedule 근무 스케줄
 * @returns 주간 근로시간 (분)
 */
export function calculateWeeklyWorkMinutes(schedule: WorkSchedule): number {
  let totalMinutes = 0
  const days: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  for (const day of days) {
    const daySchedule = schedule[day]
    if (daySchedule.isWorking && daySchedule.start && daySchedule.end) {
      const [startH, startM] = daySchedule.start.split(':').map(Number)
      const [endH, endM] = daySchedule.end.split(':').map(Number)
      let workMinutes = (endH * 60 + endM) - (startH * 60 + startM)

      // 휴게시간 제외
      if (daySchedule.breakStart && daySchedule.breakEnd) {
        const [breakStartH, breakStartM] = daySchedule.breakStart.split(':').map(Number)
        const [breakEndH, breakEndM] = daySchedule.breakEnd.split(':').map(Number)
        const breakMinutes = (breakEndH * 60 + breakEndM) - (breakStartH * 60 + breakStartM)
        workMinutes -= breakMinutes
      }

      totalMinutes += workMinutes
    }
  }

  return totalMinutes
}

/**
 * 근무 스케줄에서 일 평균 근로시간 계산
 * @param schedule 근무 스케줄
 * @returns 일 평균 근로시간 (시간)
 */
export function calculateDailyAverageWorkHours(schedule: WorkSchedule): number {
  const days: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  let totalMinutes = 0
  let workDayCount = 0

  for (const day of days) {
    const daySchedule = schedule[day]
    if (daySchedule.isWorking && daySchedule.start && daySchedule.end) {
      const [startH, startM] = daySchedule.start.split(':').map(Number)
      const [endH, endM] = daySchedule.end.split(':').map(Number)
      let workMinutes = (endH * 60 + endM) - (startH * 60 + startM)

      // 휴게시간 제외
      if (daySchedule.breakStart && daySchedule.breakEnd) {
        const [breakStartH, breakStartM] = daySchedule.breakStart.split(':').map(Number)
        const [breakEndH, breakEndM] = daySchedule.breakEnd.split(':').map(Number)
        const breakMinutes = (breakEndH * 60 + breakEndM) - (breakStartH * 60 + breakStartM)
        workMinutes -= breakMinutes
      }

      totalMinutes += workMinutes
      workDayCount++
    }
  }

  if (workDayCount === 0) return 8 // 기본값 8시간
  return totalMinutes / 60 / workDayCount
}

/**
 * 주간 근무일수 계산
 * @param schedule 근무 스케줄
 * @returns 주간 근무일수
 */
export function calculateWeeklyWorkDays(schedule: WorkSchedule): number {
  const days: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  let workDayCount = 0

  for (const day of days) {
    if (schedule[day].isWorking) {
      workDayCount++
    }
  }

  return workDayCount
}

/**
 * 월 소정 근로시간 계산 (병원 실제 근무시간 기반)
 * 공식: (주간 근로시간 × 365 ÷ 7 ÷ 12) + 주휴시간
 * @param weeklyWorkHours 주간 근로시간 (시간)
 * @param weeklyWorkDays 주간 근무일수
 * @returns 월 소정 근로시간
 */
export function calculateMonthlyWorkHours(weeklyWorkHours: number, weeklyWorkDays: number): number {
  // 주휴시간 = (주간 근로시간 / 주간 근무일수) = 하루치 시간
  const weeklyHolidayHours = weeklyWorkDays > 0 ? weeklyWorkHours / weeklyWorkDays : 0
  // 월 소정 근로시간 = (주간 근로시간 + 주휴시간) × (365 / 7 / 12)
  const monthlyHours = (weeklyWorkHours + weeklyHolidayHours) * (365 / 7 / 12)
  return Math.round(monthlyHours * 100) / 100
}

/**
 * 급여 계산 기준 정보 생성
 * @param monthlyBaseSalary 월 기본급 (비과세 제외, 4대보험 및 세금 공제 전)
 * @param workSchedule 근무 스케줄 (없으면 기본값 사용)
 */
export function calculatePayrollBasis(
  monthlyBaseSalary: number,
  workSchedule?: WorkSchedule
): PayrollBasis {
  const schedule = workSchedule || DEFAULT_WORK_SCHEDULE

  // 근무 스케줄에서 실제 근로시간 계산
  const weeklyWorkMinutes = calculateWeeklyWorkMinutes(schedule)
  const weeklyWorkHours = weeklyWorkMinutes / 60
  const weeklyWorkDays = calculateWeeklyWorkDays(schedule)
  const dailyAverageHours = calculateDailyAverageWorkHours(schedule)

  // 월 소정 근로시간 계산 (실제 근무시간 비례)
  // 주 40시간 기준 209시간에서 비례 계산
  const monthlyWorkHours = calculateMonthlyWorkHours(weeklyWorkHours, weeklyWorkDays)

  // 월 소정 근로일수 = 월 소정 근로시간 / 일 평균 근로시간
  const monthlyWorkDays = dailyAverageHours > 0 ? monthlyWorkHours / dailyAverageHours : 21.75

  // 통상 시급 = 월 기본급 / 월 소정 근로시간
  const hourlyWage = monthlyWorkHours > 0 ? Math.round(monthlyBaseSalary / monthlyWorkHours) : 0

  // 일급 = 통상 시급 × 일 평균 근로시간
  const dailyWage = Math.round(hourlyWage * dailyAverageHours)

  // 주휴수당 = 일급 (주 만근 시 1일분 지급)
  const weeklyHolidayPay = dailyWage

  return {
    monthlyBaseSalary,
    monthlyWorkDays: Math.round(monthlyWorkDays * 100) / 100,
    dailyWorkHours: Math.round(dailyAverageHours * 100) / 100,
    monthlyWorkHours: Math.round(monthlyWorkHours * 100) / 100,
    dailyWage,
    hourlyWage,
    weeklyHolidayPay
  }
}

/**
 * 해당 월의 소정 근로일수 계산 (근무 스케줄 기반)
 * @param year 연도
 * @param month 월
 * @param workSchedule 직원 근무 스케줄 (없으면 기본 스케줄 사용)
 */
/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getScheduledWorkDaysFromSchedule(
  year: number,
  month: number,
  workSchedule?: WorkSchedule,
  holidayDates?: Set<string>,
  endDate?: Date
): number {
  const schedule = workSchedule || DEFAULT_WORK_SCHEDULE
  const daysInMonth = new Date(year, month, 0).getDate()
  let workDays = 0

  // 종료일 결정: endDate가 있으면 해당 월 내에서 min(endDate, 월말)
  let lastDay = daysInMonth
  if (endDate) {
    const endYear = endDate.getFullYear()
    const endMonth = endDate.getMonth() + 1
    if (endYear === year && endMonth === month) {
      lastDay = Math.min(endDate.getDate(), daysInMonth)
    } else if (endYear < year || (endYear === year && endMonth < month)) {
      // 종료일이 해당 월보다 이전이면 0일
      return 0
    }
    // 종료일이 해당 월보다 이후면 전체 월 계산
  }

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day)
    const dateStr = formatDateString(date)
    const dayOfWeek = date.getDay()
    const dayName = DAY_OF_WEEK_TO_NAME[dayOfWeek]

    // 공휴일이면 근무일에서 제외
    if (holidayDates && holidayDates.has(dateStr)) {
      continue
    }

    // 해당 요일이 근무일인지 확인
    if (schedule[dayName]?.isWorking) {
      workDays++
    }
  }

  return workDays
}

/**
 * 해당 월의 소정 근로일수 계산 (단순 주말 제외 - 레거시)
 * @param year 연도
 * @param month 월
 * @param weekendOff 주말 휴무 여부 (기본: true - 토/일 휴무)
 * @deprecated Use getScheduledWorkDaysFromSchedule instead
 */
export function getScheduledWorkDays(
  year: number,
  month: number,
  weekendOff: boolean = true
): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let workDays = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()

    // 주말(토/일) 제외
    if (weekendOff && (dayOfWeek === 0 || dayOfWeek === 6)) {
      continue
    }

    workDays++
  }

  return workDays
}

/**
 * 급여 계산용 근태 요약 조회
 * 해당 월의 근태 기록을 기반으로 급여 계산에 필요한 정보를 요약
 *
 * 계산 로직:
 * - 근무일: 직원 근무 스케줄 기반 해당 월의 총 근무해야 하는 일수
 * - 출근일: 출근 기록이 있는 일수 (present, late, early_leave)
 * - 결근일: 근무일 - 출근일 - 유급연차사용일
 * - 무단결근일: 결근일 중 연차를 사용하지 않은 일수
 *
 * @param employeeId 직원 ID
 * @param clinicId 병원 ID
 * @param year 연도
 * @param month 월
 * @param workSchedule 직원 근무 스케줄 (옵션)
 * @param hireDate 입사일 (옵션) - 연차 계산에 사용
 */
export async function getAttendanceSummaryForPayroll(
  employeeId: string,
  clinicId: string,
  year: number,
  month: number,
  workSchedule?: WorkSchedule,
  hireDate?: string
): Promise<{ success: boolean; data?: AttendanceSummaryForPayroll; error?: string }> {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // 해당 월의 법정 공휴일 조회 (결근 처리 제외용)
    const publicHolidays = getPublicHolidaySet(year, month, true)

    // 오늘 날짜 (결근 계산 시 미래 날짜 제외용)
    const today = new Date()
    today.setHours(23, 59, 59, 999) // 오늘 하루 전체 포함

    // 현재 월인지 확인
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month

    // 근태 기록 조회
    const response = await fetch(
      `/api/attendance/records?clinicId=${clinicId}&userId=${employeeId}&startDate=${startDate}&endDate=${endDate}`
    )
    const result = await response.json()

    // 소정 근로일수 계산 (직원 근무 스케줄 기반, 공휴일 제외)
    const totalWorkDays = getScheduledWorkDaysFromSchedule(year, month, workSchedule, publicHolidays)

    // 지나간 근무일수 계산 (결근 계산용 - 현재 월이면 오늘까지만, 과거 월이면 전체)
    const passedWorkDays = isCurrentMonth
      ? getScheduledWorkDaysFromSchedule(year, month, workSchedule, publicHolidays, today)
      : totalWorkDays

    if (!result.success) {
      // API가 없거나 오류 발생 시 에러 반환 (결근 마스킹 방지)
      console.warn('Attendance API not available:', result.error)
      return {
        success: false,
        error: result.error || '근태 데이터를 불러올 수 없습니다.'
      }
    }

    const records = result.data || []

    // 근태 통계 집계
    // 출근일: present, late, early_leave 상태의 기록
    let presentDays = 0
    let leaveDays = 0 // 연차 사용일
    let holidayDays = 0 // 공휴일
    let lateCount = 0
    let totalLateMinutes = 0
    let earlyLeaveCount = 0
    let totalEarlyLeaveMinutes = 0
    let overtimeMinutes = 0

    // 출근 기록이 있는 날짜 집합 (중복 방지)
    const presentDates = new Set<string>()
    const leaveDates = new Set<string>()

    for (const record of records) {
      const recordDate = record.work_date

      switch (record.status) {
        case 'present':
          if (!presentDates.has(recordDate)) {
            presentDays++
            presentDates.add(recordDate)
          }
          break
        case 'late':
          if (!presentDates.has(recordDate)) {
            presentDays++
            presentDates.add(recordDate)
          }
          lateCount++
          totalLateMinutes += record.late_minutes || 0
          break
        case 'early_leave':
          if (!presentDates.has(recordDate)) {
            presentDays++
            presentDates.add(recordDate)
          }
          earlyLeaveCount++
          totalEarlyLeaveMinutes += record.early_leave_minutes || 0
          break
        case 'leave':
          if (!leaveDates.has(recordDate)) {
            leaveDays++
            leaveDates.add(recordDate)
          }
          break
        case 'holiday':
          holidayDays++
          break
        // 'absent' 상태는 별도 집계하지 않음 - 계산으로 도출
      }

      // 초과근무 시간 집계
      overtimeMinutes += record.overtime_minutes || 0
    }

    // 연차 정보 조회 (입사일 기준 근로기준법 계산)
    // 1년 미만: 월 1일 (최대 11일)
    // 1년 이상: 15일 기본 + 2년마다 1일 추가 (최대 25일)
    const referenceDate = new Date(year, month - 1, 1) // 해당 월의 시작일 기준
    let allowedAnnualLeave = 15 // 기본값

    if (hireDate) {
      const hireDateObj = new Date(hireDate)
      allowedAnnualLeave = calculateAnnualLeaveDays(hireDateObj, referenceDate)
      console.log('[getAttendanceSummaryForPayroll] 입사일 기반 연차 계산:', {
        hireDate,
        referenceDate: referenceDate.toISOString().split('T')[0],
        allowedAnnualLeave
      })
    }

    const usedAnnualLeave = leaveDays
    const remainingAnnualLeave = Math.max(0, allowedAnnualLeave - usedAnnualLeave)

    // 유급 연차 사용일 (허용 범위 내만 유급 처리)
    const paidLeaveDays = Math.min(leaveDays, allowedAnnualLeave)

    // 결근일 계산: 지나간 근무일 - 출근일 - 유급연차사용일
    // passedWorkDays를 사용하여 미래 날짜는 결근으로 계산하지 않음
    // 이렇게 하면 무단결근 + 연차초과가 결근일에 포함됨
    const absentDays = Math.max(0, passedWorkDays - presentDays - paidLeaveDays)

    console.log('[getAttendanceSummaryForPayroll] 근태 요약 계산:', {
      employeeId,
      year,
      month,
      isCurrentMonth,
      totalWorkDays,
      passedWorkDays, // 결근 계산에 사용되는 지나간 근무일수
      presentDays,
      leaveDays,
      paidLeaveDays,
      absentDays,
      allowedAnnualLeave,
      usedAnnualLeave
    })

    const summary: AttendanceSummaryForPayroll = {
      userId: employeeId,
      year,
      month,
      totalWorkDays,
      presentDays,
      absentDays, // 계산된 결근일 (무단결근)
      leaveDays,
      holidayDays,
      lateCount,
      totalLateMinutes,
      earlyLeaveCount,
      totalEarlyLeaveMinutes,
      overtimeMinutes,
      nightWorkMinutes: 0, // 야간근무 별도 집계 필요
      holidayWorkMinutes: 0, // 휴일근무 별도 집계 필요
      allowedAnnualLeave,
      usedAnnualLeave,
      remainingAnnualLeave
    }

    return { success: true, data: summary }
  } catch (error) {
    console.error('Error fetching attendance summary:', error)
    // 오류 발생 시 에러 반환 (결근 마스킹 방지)
    return {
      success: false,
      error: error instanceof Error ? error.message : '근태 데이터 조회 중 오류가 발생했습니다.'
    }
  }
}

/**
 * 기본 근태 요약 생성 (데이터가 없을 때)
 */
function createDefaultAttendanceSummary(
  employeeId: string,
  year: number,
  month: number,
  totalWorkDays?: number
): AttendanceSummaryForPayroll {
  const workDays = totalWorkDays ?? getScheduledWorkDays(year, month, true)

  return {
    userId: employeeId,
    year,
    month,
    totalWorkDays: workDays,
    presentDays: workDays, // 모두 출근한 것으로 간주
    absentDays: 0,
    leaveDays: 0,
    holidayDays: 0,
    lateCount: 0,
    totalLateMinutes: 0,
    earlyLeaveCount: 0,
    totalEarlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    nightWorkMinutes: 0,
    holidayWorkMinutes: 0,
    allowedAnnualLeave: 15,
    usedAnnualLeave: 0,
    remainingAnnualLeave: 15
  }
}

/**
 * 근태 차감 옵션 인터페이스
 */
export interface AttendanceDeductionOptions {
  /** 지각 시간 급여 차감 여부 (기본: true) */
  deductLateMinutes?: boolean
  /** 조퇴 시간 급여 차감 여부 (기본: true) */
  deductEarlyLeaveMinutes?: boolean
}

/**
 * 근태 기반 급여 차감 계산
 * 대한민국 근로기준법에 따라 차감액 계산:
 *
 * 1. 조퇴/반차: 잔여 연차가 있으면 유급 처리(차감 없음), 없으면 시급 × 시간 차감
 * 2. 무단결근/연차초과 휴무(무급휴가):
 *    - 일급 × 결근일수
 *    - 주휴수당 차감: 해당 주에 결근이 있으면 1일분 주휴수당 차감 (주당 최대 1일분)
 * 3. 유급휴가 (연차, 경조사, 대체휴가 등): 차감 없음 (만근으로 계산)
 *
 * @param basis 급여 계산 기준
 * @param attendance 근태 요약 정보
 * @param allowedAnnualLeave 허용 연차 일수 (옵션)
 * @param weeksWithAbsence 결근이 있는 주 수 (옵션, 없으면 결근일수 기반 추정)
 * @param options 차감 옵션 (지각/조퇴 차감 여부)
 */
export function calculateAttendanceDeduction(
  basis: PayrollBasis,
  attendance: AttendanceSummaryForPayroll,
  allowedAnnualLeave?: number,
  weeksWithAbsence?: number,
  options?: AttendanceDeductionOptions
): AttendanceDeduction {
  // 기본 옵션 설정
  const deductLate = options?.deductLateMinutes !== false
  const deductEarlyLeave = options?.deductEarlyLeaveMinutes !== false

  console.log('[calculateAttendanceDeduction] Options received:', {
    options,
    deductLate,
    deductEarlyLeave,
    lateMinutes: attendance.totalLateMinutes,
    earlyLeaveMinutes: attendance.totalEarlyLeaveMinutes
  })

  const details: DeductionDetail[] = []
  let totalDeduction = 0

  // 잔여 연차 계산
  const allowed = allowedAnnualLeave ?? attendance.allowedAnnualLeave
  const remainingAnnualLeave = attendance.remainingAnnualLeave

  // =====================================================================
  // 1. 조퇴/반차 차감 계산
  // - 차감 옵션이 꺼져있으면: 차감 없음
  // - 잔여 연차가 있으면: 유급 처리 (차감 없음)
  // - 잔여 연차가 없으면: 통상시급 × 조퇴시간 차감
  // =====================================================================
  let earlyLeaveDeduction = 0
  let earlyLeaveMinutesToDeduct = 0

  if (attendance.totalEarlyLeaveMinutes > 0) {
    // 조퇴 시간을 연차로 커버 가능한지 확인
    // 반차 = 4시간(240분), 연차 1일 = 일 평균 근로시간
    const dailyWorkMinutes = basis.dailyWorkHours * 60

    if (!deductEarlyLeave) {
      // 조퇴 차감 옵션이 꺼져있으면 차감 없음
      details.push({
        reason: 'early_leave',
        description: `조퇴 ${attendance.earlyLeaveCount}회 (총 ${attendance.totalEarlyLeaveMinutes}분) - 차감 미적용 설정`,
        count: attendance.earlyLeaveCount,
        minutes: attendance.totalEarlyLeaveMinutes,
        amount: 0
      })
    } else if (remainingAnnualLeave > 0) {
      // 잔여 연차가 있으면 유급 처리 (차감 없음)
      // 조퇴 시간만큼 연차를 사용한 것으로 처리
      details.push({
        reason: 'early_leave',
        description: `조퇴 ${attendance.earlyLeaveCount}회 (총 ${attendance.totalEarlyLeaveMinutes}분) - 잔여 연차로 유급 처리`,
        count: attendance.earlyLeaveCount,
        minutes: attendance.totalEarlyLeaveMinutes,
        amount: 0
      })
    } else {
      // 잔여 연차가 없으면 조퇴 시간만큼 차감
      earlyLeaveMinutesToDeduct = attendance.totalEarlyLeaveMinutes
      earlyLeaveDeduction = Math.round((earlyLeaveMinutesToDeduct / 60) * basis.hourlyWage)

      details.push({
        reason: 'early_leave',
        description: `조퇴 ${attendance.earlyLeaveCount}회 (총 ${attendance.totalEarlyLeaveMinutes}분) - 무급 처리`,
        count: attendance.earlyLeaveCount,
        minutes: earlyLeaveMinutesToDeduct,
        amount: earlyLeaveDeduction
      })

      totalDeduction += earlyLeaveDeduction
    }
  }

  // =====================================================================
  // 2. 무단결근 및 연차초과 휴무(무급휴가) 차감 계산
  // - 일급 × 결근일수
  // - 주휴수당: 결근이 있는 주마다 1일분 차감 (주당 최대 1일분)
  // =====================================================================

  // 연차 초과 사용일수 계산 (내역 표시용 - absentDays에 이미 포함됨)
  const excessLeaves = Math.max(0, attendance.usedAnnualLeave - allowed)

  // 무단결근일 = 총 결근일 - 연차초과일
  // (absentDays = 근무일 - 출근일 - 유급연차사용일, 이므로 무단결근+연차초과 포함)
  const unauthorizedAbsentDays = Math.max(0, attendance.absentDays - excessLeaves)

  // 총 무급 결근일수 = attendance.absentDays (이미 무단결근 + 연차초과 포함)
  const totalUnpaidAbsentDays = attendance.absentDays

  console.log('[calculateAttendanceDeduction] 결근 계산:', {
    absentDays: attendance.absentDays,
    excessLeaves,
    unauthorizedAbsentDays,
    totalUnpaidAbsentDays,
    dailyWage: basis.dailyWage,
    weeklyHolidayPay: basis.weeklyHolidayPay
  })

  let absentDeduction = 0
  let weeklyHolidayPayDeduction = 0

  if (totalUnpaidAbsentDays > 0) {
    // 결근 급여 차감: 일급 × 결근일수
    absentDeduction = totalUnpaidAbsentDays * basis.dailyWage

    // 주휴수당 차감: 결근이 있는 주 수만큼 1일분씩 차감
    // weeksWithAbsence가 제공되지 않으면, 결근일수를 기반으로 추정
    // (매주 5일 근무 가정, 결근일수 / 5의 올림 = 영향받는 주 수)
    const estimatedWeeksWithAbsence = weeksWithAbsence ??
      Math.min(Math.ceil(totalUnpaidAbsentDays / 5), 4) // 최대 4주 (한 달)

    weeklyHolidayPayDeduction = estimatedWeeksWithAbsence * basis.weeklyHolidayPay

    // 무단결근 내역 추가 (연차초과 제외한 순수 무단결근)
    if (unauthorizedAbsentDays > 0) {
      details.push({
        reason: 'absent',
        description: `무단결근 ${unauthorizedAbsentDays}일`,
        count: unauthorizedAbsentDays,
        amount: unauthorizedAbsentDays * basis.dailyWage,
        weeklyHolidayPayDeducted: false
      })
    }

    // 연차 초과 내역 추가
    if (excessLeaves > 0) {
      details.push({
        reason: 'excess_leave',
        description: `연차 초과 사용 ${excessLeaves}일 (허용: ${allowed}일, 사용: ${attendance.usedAnnualLeave}일) - 무급 휴가 처리`,
        count: excessLeaves,
        amount: excessLeaves * basis.dailyWage
      })
    }

    // 주휴수당 차감 내역 추가
    if (weeklyHolidayPayDeduction > 0) {
      details.push({
        reason: 'absent',
        description: `주휴수당 차감 (${estimatedWeeksWithAbsence}주분)`,
        count: estimatedWeeksWithAbsence,
        amount: weeklyHolidayPayDeduction,
        weeklyHolidayPayDeducted: true
      })
    }

    totalDeduction += absentDeduction + weeklyHolidayPayDeduction
  }

  // =====================================================================
  // 3. 지각 차감 계산
  // - 차감 옵션이 꺼져있으면: 차감 없음
  // - 지각은 일반적으로 무급 처리 (시급 × 지각시간)
  // - 회사 정책에 따라 일정 시간 이하는 면제할 수 있음
  // =====================================================================
  let lateDeduction = 0
  if (attendance.totalLateMinutes > 0) {
    if (!deductLate) {
      // 지각 차감 옵션이 꺼져있으면 차감 없음
      details.push({
        reason: 'late',
        description: `지각 ${attendance.lateCount}회 (총 ${attendance.totalLateMinutes}분) - 차감 미적용 설정`,
        count: attendance.lateCount,
        minutes: attendance.totalLateMinutes,
        amount: 0
      })
    } else {
      lateDeduction = Math.round((attendance.totalLateMinutes / 60) * basis.hourlyWage)

      details.push({
        reason: 'late',
        description: `지각 ${attendance.lateCount}회 (총 ${attendance.totalLateMinutes}분)`,
        count: attendance.lateCount,
        minutes: attendance.totalLateMinutes,
        amount: lateDeduction
      })

      totalDeduction += lateDeduction
    }
  }

  // =====================================================================
  // 4. 유급휴가 (연차, 경조사 등) - 차감 없음
  // 연차 사용은 차감 대상이 아님 (이미 presentDays에서 제외되어 있음)
  // =====================================================================
  // 유급휴가는 급여에서 차감하지 않음 (만근 처리)

  console.log('[calculateAttendanceDeduction] Final result:', {
    lateDeduction,
    earlyLeaveDeduction,
    absentDeduction,
    totalDeduction
  })

  return {
    scheduledWorkDays: attendance.totalWorkDays,
    actualWorkDays: attendance.presentDays,
    absentDays: attendance.absentDays,
    absentDeduction,
    weeklyHolidayPayDeduction,
    lateCount: attendance.lateCount,
    totalLateMinutes: attendance.totalLateMinutes,
    lateDeduction,
    earlyLeaveCount: attendance.earlyLeaveCount,
    totalEarlyLeaveMinutes: attendance.totalEarlyLeaveMinutes,
    earlyLeaveDeduction,
    usedLeaves: attendance.leaveDays,
    allowedLeaves: allowed,
    excessLeaves,
    excessLeaveDeduction: excessLeaves * basis.dailyWage,
    totalDeduction,
    deductionDetails: details
  }
}

/**
 * 초과근무 수당 계산
 * - 연장근로: 시급 × 1.5
 * - 야간근로(22시~06시): 시급 × 0.5 (연장근로와 별도 가산)
 * - 휴일근로: 시급 × 1.5 (8시간 이내), 시급 × 2.0 (8시간 초과)
 */
export function calculateOvertimePay(
  hourlyWage: number,
  overtimeMinutes: number,
  nightWorkMinutes: number = 0,
  holidayWorkMinutes: number = 0
): { overtimePay: number; nightWorkPay: number; holidayWorkPay: number } {
  // 연장근로수당 (시급 × 1.5)
  const overtimePay = Math.round((overtimeMinutes / 60) * hourlyWage * 1.5)

  // 야간근로수당 (시급 × 0.5 가산)
  const nightWorkPay = Math.round((nightWorkMinutes / 60) * hourlyWage * 0.5)

  // 휴일근로수당 (시급 × 1.5)
  const holidayWorkPay = Math.round((holidayWorkMinutes / 60) * hourlyWage * 1.5)

  return {
    overtimePay,
    nightWorkPay,
    holidayWorkPay
  }
}

/**
 * 근태 연동 급여 계산 (통합)
 * 기본급에서 근태 차감을 적용하고 초과근무수당을 추가
 */
export async function calculatePayrollWithAttendance(
  input: AttendancePayrollInput,
  clinicId: string
): Promise<{ success: boolean; data?: AttendancePayrollResult; error?: string }> {
  try {
    // 기본 옵션 설정
    const includeOvertimePay = input.includeOvertimePay !== false

    // 1. 급여 계산 기준 생성
    const basis = calculatePayrollBasis(input.baseSalary)

    // 2. 근태 요약 조회
    const attendanceResult = await getAttendanceSummaryForPayroll(
      input.employeeId,
      clinicId,
      input.year,
      input.month
    )

    if (!attendanceResult.success || !attendanceResult.data) {
      return { success: false, error: attendanceResult.error || '근태 정보를 가져올 수 없습니다.' }
    }

    const attendance = attendanceResult.data

    // 3. 근태 기반 급여 차감 계산 (옵션 전달)
    const deductionOptions: AttendanceDeductionOptions = {
      deductLateMinutes: input.deductLateMinutes,
      deductEarlyLeaveMinutes: input.deductEarlyLeaveMinutes
    }
    const deduction = calculateAttendanceDeduction(
      basis,
      attendance,
      input.allowedAnnualLeave,
      undefined,
      deductionOptions
    )

    // 4. 초과근무 수당 계산 (옵션에 따라 계산 여부 결정)
    let overtimePays = { overtimePay: 0, nightWorkPay: 0, holidayWorkPay: 0 }
    if (includeOvertimePay) {
      overtimePays = calculateOvertimePay(
        basis.hourlyWage,
        attendance.overtimeMinutes,
        attendance.nightWorkMinutes,
        attendance.holidayWorkMinutes
      )
    }

    // 5. 조정된 기본급 계산
    const adjustedBaseSalary = Math.max(0, input.baseSalary - deduction.totalDeduction)

    return {
      success: true,
      data: {
        basis,
        attendance,
        deduction,
        adjustedBaseSalary,
        overtimePay: overtimePays.overtimePay,
        nightWorkPay: overtimePays.nightWorkPay,
        holidayWorkPay: overtimePays.holidayWorkPay
      }
    }
  } catch (error) {
    console.error('Error calculating payroll with attendance:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '급여 계산 중 오류가 발생했습니다.'
    }
  }
}

/**
 * 급여 명세서 접근 권한 확인
 * - 대표 원장(owner): 항상 접근 가능 (실시간)
 * - 일반 직원: 해당 월의 말일 이후에만 접근 가능
 *
 * @param userRole 사용자 역할
 * @param year 급여 연도
 * @param month 급여 월
 * @param isOwnStatement 본인의 급여명세서 여부
 */
export function checkPayrollAccess(
  userRole: string,
  year: number,
  month: number,
  isOwnStatement: boolean = false
): PayrollAccessResult {
  // 대표 원장은 항상 접근 가능
  if (userRole === 'owner') {
    return { canAccess: true }
  }

  // 본인의 급여명세서가 아니면 접근 불가
  if (!isOwnStatement) {
    return {
      canAccess: false,
      reason: '본인의 급여명세서만 확인할 수 있습니다.'
    }
  }

  // 해당 월의 마지막 날 계산
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const availableDate = new Date(year, month - 1, lastDayOfMonth)
  const today = new Date()

  // 현재 날짜가 해당 월의 말일 이후인지 확인
  // 시간 비교를 위해 날짜만 비교 (시간은 무시)
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const availableDateOnly = new Date(availableDate.getFullYear(), availableDate.getMonth(), availableDate.getDate())

  if (todayDate >= availableDateOnly) {
    return { canAccess: true }
  }

  return {
    canAccess: false,
    reason: `${year}년 ${month}월 급여명세서는 ${month}월 ${lastDayOfMonth}일 이후에 확인할 수 있습니다.`,
    availableDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
  }
}

/**
 * 특정 월이 급여 확정 상태인지 확인
 * (해당 월이 지났으면 확정된 것으로 간주)
 */
export function isPayrollFinalized(year: number, month: number): boolean {
  const today = new Date()
  const lastDayOfMonth = new Date(year, month, 0)

  // 오늘이 해당 월의 마지막 날 이후이면 확정
  return today > lastDayOfMonth
}
