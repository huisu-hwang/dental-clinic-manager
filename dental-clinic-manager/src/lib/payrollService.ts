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
  PayrollFormState
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
      // snake_case를 camelCase로 변환
      const statements = result.data.map((item: Record<string, unknown>) => ({
        id: item.id,
        clinicId: item.clinic_id,
        employeeId: item.employee_id,
        statementYear: item.statement_year,
        statementMonth: item.statement_month,
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
