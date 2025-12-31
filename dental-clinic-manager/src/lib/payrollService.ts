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
 * 월 소정 근로시간 상수 (통상 209시간)
 * 주 40시간 × (365일 ÷ 7일 ÷ 12개월) + 주휴 8시간 = 약 209시간
 */
const MONTHLY_WORK_HOURS = 209

/**
 * 일 소정 근로시간 (8시간)
 */
const DAILY_WORK_HOURS = 8

/**
 * 월 소정 근로일수 계산 (약 21.75일)
 */
const MONTHLY_WORK_DAYS = MONTHLY_WORK_HOURS / DAILY_WORK_HOURS

/**
 * 급여 계산 기준 정보 생성
 * @param monthlyBaseSalary 월 기본급 (비과세 제외, 4대보험 및 세금 공제 전)
 */
export function calculatePayrollBasis(monthlyBaseSalary: number): PayrollBasis {
  const hourlyWage = Math.round(monthlyBaseSalary / MONTHLY_WORK_HOURS)
  const dailyWage = Math.round(monthlyBaseSalary / MONTHLY_WORK_DAYS)
  // 주휴수당: 일급 × 1일 (주 5일 개근 시 지급)
  const weeklyHolidayPay = dailyWage

  return {
    monthlyBaseSalary,
    monthlyWorkDays: MONTHLY_WORK_DAYS,
    dailyWorkHours: DAILY_WORK_HOURS,
    monthlyWorkHours: MONTHLY_WORK_HOURS,
    dailyWage,
    hourlyWage,
    weeklyHolidayPay
  }
}

/**
 * 해당 월의 소정 근로일수 계산
 * @param year 연도
 * @param month 월
 * @param weekendOff 주말 휴무 여부 (기본: true - 토/일 휴무)
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
 */
export async function getAttendanceSummaryForPayroll(
  employeeId: string,
  clinicId: string,
  year: number,
  month: number
): Promise<{ success: boolean; data?: AttendanceSummaryForPayroll; error?: string }> {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // 근태 기록 조회
    const response = await fetch(
      `/api/attendance/records?clinicId=${clinicId}&userId=${employeeId}&startDate=${startDate}&endDate=${endDate}`
    )
    const result = await response.json()

    if (!result.success) {
      // API가 없거나 오류 발생 시 기본값 반환
      console.warn('Attendance API not available, using default values')
      return {
        success: true,
        data: createDefaultAttendanceSummary(employeeId, year, month)
      }
    }

    const records = result.data || []

    // 소정 근로일수 계산 (주말 제외)
    const totalWorkDays = getScheduledWorkDays(year, month, true)

    // 근태 통계 집계
    let presentDays = 0
    let absentDays = 0
    let leaveDays = 0
    let holidayDays = 0
    let lateCount = 0
    let totalLateMinutes = 0
    let earlyLeaveCount = 0
    let totalEarlyLeaveMinutes = 0
    let overtimeMinutes = 0

    for (const record of records) {
      switch (record.status) {
        case 'present':
          presentDays++
          break
        case 'late':
          presentDays++
          lateCount++
          totalLateMinutes += record.late_minutes || 0
          break
        case 'early_leave':
          presentDays++
          earlyLeaveCount++
          totalEarlyLeaveMinutes += record.early_leave_minutes || 0
          break
        case 'absent':
          absentDays++
          break
        case 'leave':
          leaveDays++
          break
        case 'holiday':
          holidayDays++
          break
      }

      // 초과근무 시간 집계
      overtimeMinutes += record.overtime_minutes || 0
    }

    // 연차 정보 조회 (연차 시스템이 있다면)
    // 현재는 기본값 사용
    const allowedAnnualLeave = 15 // 기본 연차 일수
    const usedAnnualLeave = leaveDays
    const remainingAnnualLeave = Math.max(0, allowedAnnualLeave - usedAnnualLeave)

    const summary: AttendanceSummaryForPayroll = {
      userId: employeeId,
      year,
      month,
      totalWorkDays,
      presentDays,
      absentDays,
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
    // 오류 발생 시 기본값 반환
    return {
      success: true,
      data: createDefaultAttendanceSummary(employeeId, year, month)
    }
  }
}

/**
 * 기본 근태 요약 생성 (데이터가 없을 때)
 */
function createDefaultAttendanceSummary(
  employeeId: string,
  year: number,
  month: number
): AttendanceSummaryForPayroll {
  const totalWorkDays = getScheduledWorkDays(year, month, true)

  return {
    userId: employeeId,
    year,
    month,
    totalWorkDays,
    presentDays: totalWorkDays, // 모두 출근한 것으로 간주
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
 * 근태 기반 급여 차감 계산
 * 대한민국 근로기준법에 따라 차감액 계산:
 * - 무단결근: 일급 × 결근일수 + 해당 주 주휴수당 미지급
 * - 지각/조퇴: 시급 × 해당 시간
 * - 연차 초과: 초과 일수 × 일급 (사전 동의 필요)
 */
export function calculateAttendanceDeduction(
  basis: PayrollBasis,
  attendance: AttendanceSummaryForPayroll,
  allowedAnnualLeave?: number
): AttendanceDeduction {
  const details: DeductionDetail[] = []
  let totalDeduction = 0

  // 1. 무단결근 차감
  // 결근일 × 일급 차감
  const absentDeduction = attendance.absentDays * basis.dailyWage
  let weeklyHolidayPayDeduction = 0

  if (attendance.absentDays > 0) {
    // 주휴수당 차감: 결근 시 해당 주의 주휴수당 미지급
    // 간략화: 결근 1일당 주휴수당 1/5 차감 (주 5일 기준)
    weeklyHolidayPayDeduction = Math.round((attendance.absentDays / 5) * basis.weeklyHolidayPay)

    details.push({
      reason: 'absent',
      description: `무단결근 ${attendance.absentDays}일`,
      count: attendance.absentDays,
      amount: absentDeduction + weeklyHolidayPayDeduction,
      weeklyHolidayPayDeducted: weeklyHolidayPayDeduction > 0
    })

    totalDeduction += absentDeduction + weeklyHolidayPayDeduction
  }

  // 2. 지각 차감
  // 지각 시간 × 시급 차감 (분 단위로 계산)
  let lateDeduction = 0
  if (attendance.totalLateMinutes > 0) {
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

  // 3. 조퇴 차감
  // 조퇴 시간 × 시급 차감 (분 단위로 계산)
  let earlyLeaveDeduction = 0
  if (attendance.totalEarlyLeaveMinutes > 0) {
    earlyLeaveDeduction = Math.round((attendance.totalEarlyLeaveMinutes / 60) * basis.hourlyWage)

    details.push({
      reason: 'early_leave',
      description: `조퇴 ${attendance.earlyLeaveCount}회 (총 ${attendance.totalEarlyLeaveMinutes}분)`,
      count: attendance.earlyLeaveCount,
      minutes: attendance.totalEarlyLeaveMinutes,
      amount: earlyLeaveDeduction
    })

    totalDeduction += earlyLeaveDeduction
  }

  // 4. 연차 초과 사용 차감
  // 초과 연차 × 일급 (사전 동의가 있는 경우에만 차감)
  const allowed = allowedAnnualLeave ?? attendance.allowedAnnualLeave
  const excessLeaves = Math.max(0, attendance.usedAnnualLeave - allowed)
  let excessLeaveDeduction = 0

  if (excessLeaves > 0) {
    excessLeaveDeduction = excessLeaves * basis.dailyWage

    details.push({
      reason: 'excess_leave',
      description: `연차 초과 사용 ${excessLeaves}일 (허용: ${allowed}일, 사용: ${attendance.usedAnnualLeave}일)`,
      count: excessLeaves,
      amount: excessLeaveDeduction
    })

    totalDeduction += excessLeaveDeduction
  }

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
    excessLeaveDeduction,
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

    // 3. 근태 기반 급여 차감 계산
    const deduction = calculateAttendanceDeduction(basis, attendance, input.allowedAnnualLeave)

    // 4. 초과근무 수당 계산
    const overtimePays = calculateOvertimePay(
      basis.hourlyWage,
      attendance.overtimeMinutes,
      attendance.nightWorkMinutes,
      attendance.holidayWorkMinutes
    )

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
