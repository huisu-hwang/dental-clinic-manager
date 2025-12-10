/**
 * 급여 명세서 서비스
 * 급여 설정, 명세서 생성, 계산 등을 처리
 */

import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { refreshSessionWithTimeout } from './sessionUtils'
import type { Session } from '@supabase/supabase-js'
import type {
  PayrollSetting,
  PayrollSettingFormData,
  PayrollStatement,
  PayrollStatementFormData,
  PayrollStatementFilters,
  PayrollKakaoLog,
  Allowances,
  OtherDeductions,
  DeductionCalculation,
  PayrollCalculation,
  INSURANCE_RATES,
  GetPayrollSettingsResponse,
  GetPayrollSettingResponse,
  SavePayrollSettingResponse,
  GetPayrollStatementsResponse,
  GetPayrollStatementResponse,
  GeneratePayrollStatementsResponse,
  SendKakaoNotificationResponse,
  NonTaxableAllowanceType,
  NonTaxableCalculation
} from '@/types/payroll'

import {
  NON_TAXABLE_LIMITS,
  ALLOWANCE_TO_NON_TAXABLE_TYPE
} from '@/types/payroll'

// 4대보험 요율 상수
const RATES = {
  nationalPension: 0.045,      // 국민연금 4.5%
  healthInsurance: 0.03545,    // 건강보험 3.545%
  longTermCare: 0.1295,        // 장기요양보험 (건강보험의 12.95%)
  employmentInsurance: 0.009,  // 고용보험 0.9%
}

/**
 * Helper function to get browser Supabase client
 */
const getSupabase = () => {
  return createBrowserClient()
}

class PayrollService {
  /**
   * Check current Supabase session with auto-refresh
   */
  private async checkSession(): Promise<{ session: Session | null; error: string | null }> {
    const supabase = getSupabase()
    if (!supabase) {
      return { session: null, error: 'Database connection failed' }
    }

    const { data, error } = await supabase.auth.getSession()

    if (error) {
      if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
        const { session: refreshedSession, error: refreshError } = await refreshSessionWithTimeout(supabase)
        if (refreshError || !refreshedSession) {
          return { session: null, error: 'SESSION_EXPIRED' }
        }
        return { session: refreshedSession, error: null }
      }
      return { session: null, error: 'SESSION_ERROR' }
    }

    if (!data.session) {
      const { session: refreshedSession, error: refreshError } = await refreshSessionWithTimeout(supabase)
      if (refreshError || !refreshedSession) {
        return { session: null, error: 'SESSION_EXPIRED' }
      }
      return { session: refreshedSession, error: null }
    }

    return { session: data.session, error: null }
  }

  // =====================================================================
  // 급여 계산 유틸리티
  // =====================================================================

  /**
   * 수당 총액 계산
   */
  calculateAllowancesTotal(allowances: Allowances): number {
    return Object.values(allowances).reduce((sum, val) => sum + (val || 0), 0)
  }

  /**
   * 비과세 금액 계산
   * 수당 항목별로 비과세 한도를 적용하여 비과세/과세 금액을 분리
   */
  calculateNonTaxableAmounts(allowances: Allowances): NonTaxableCalculation {
    let totalNonTaxable = 0
    const nonTaxableDetails: NonTaxableCalculation['nonTaxableDetails'] = []

    for (const [name, amount] of Object.entries(allowances)) {
      const nonTaxableType = ALLOWANCE_TO_NON_TAXABLE_TYPE[name] || 'none'

      if (nonTaxableType !== 'none' && amount > 0) {
        // 비과세 한도 적용
        const limit = NON_TAXABLE_LIMITS[nonTaxableType]
        const nonTaxableAmount = Math.min(amount, limit)
        const taxableAmount = Math.max(0, amount - limit)

        totalNonTaxable += nonTaxableAmount
        nonTaxableDetails.push({
          type: nonTaxableType,
          name,
          amount,
          nonTaxableAmount,
          taxableAmount
        })
      } else if (amount > 0) {
        // 과세 항목
        nonTaxableDetails.push({
          type: 'none',
          name,
          amount,
          nonTaxableAmount: 0,
          taxableAmount: amount
        })
      }
    }

    return {
      totalNonTaxable,
      taxableEarnings: 0, // 나중에 계산됨
      nonTaxableDetails
    }
  }

  /**
   * 4대보험 및 세금 공제액 계산
   * @param totalEarnings - 총 급여 (세전)
   * @param options - 공제 옵션
   * @param nonTaxableAmount - 비과세 금액 (소득세 계산에서 제외)
   */
  calculateDeductions(
    totalEarnings: number,
    options: {
      nationalPension?: boolean
      healthInsurance?: boolean
      longTermCare?: boolean
      employmentInsurance?: boolean
      incomeTaxEnabled?: boolean
      dependentsCount?: number
    } = {},
    nonTaxableAmount: number = 0
  ): DeductionCalculation {
    const {
      nationalPension = true,
      healthInsurance = true,
      longTermCare = true,
      employmentInsurance = true,
      incomeTaxEnabled = true,
      dependentsCount = 1
    } = options

    // 과세 대상 금액 (비과세 금액 제외)
    const taxableEarnings = Math.max(0, totalEarnings - nonTaxableAmount)

    // 국민연금 (상한액 적용: 월 590만원) - 비과세 수당 제외
    const pensionBase = Math.min(taxableEarnings, 5900000)
    const nationalPensionAmount = nationalPension ? Math.round(pensionBase * RATES.nationalPension) : 0

    // 건강보험 - 비과세 수당 제외
    const healthInsuranceAmount = healthInsurance ? Math.round(taxableEarnings * RATES.healthInsurance) : 0

    // 장기요양보험 (건강보험의 12.95%)
    const longTermCareAmount = longTermCare ? Math.round(healthInsuranceAmount * RATES.longTermCare) : 0

    // 고용보험 - 비과세 수당 제외
    const employmentInsuranceAmount = employmentInsurance ? Math.round(taxableEarnings * RATES.employmentInsurance) : 0

    // 소득세 (간이세액 기준 - 실제로는 간이세액표 적용 필요)
    // 여기서는 간략화된 계산 (약 3.3% 적용)
    let incomeTax = 0
    if (incomeTaxEnabled) {
      // 부양가족 수에 따른 감면 적용 (1인당 월 12.5만원 기본공제 가정)
      // 비과세 금액은 이미 제외되어 있음
      const taxableIncome = Math.max(0, taxableEarnings - (dependentsCount * 125000))
      incomeTax = Math.round(taxableIncome * 0.033)
    }

    // 지방소득세 (소득세의 10%)
    const localIncomeTax = Math.round(incomeTax * 0.1)

    const totalDeductions = nationalPensionAmount + healthInsuranceAmount + longTermCareAmount +
                            employmentInsuranceAmount + incomeTax + localIncomeTax

    return {
      nationalPension: nationalPensionAmount,
      healthInsurance: healthInsuranceAmount,
      longTermCare: longTermCareAmount,
      employmentInsurance: employmentInsuranceAmount,
      incomeTax,
      localIncomeTax,
      totalDeductions
    }
  }

  /**
   * 세후 급여(실수령액)에서 세전 급여 역산
   * 이진 탐색을 사용하여 목표 실수령액에 맞는 세전 급여 계산
   *
   * @param targetNetPay - 목표 실수령액 (비과세 수당 포함)
   * @param options - 공제 옵션
   * @param allowances - 수당 항목 (비과세 계산용)
   *
   * 예시: 세후 400만원, 식대 20만원 설정 시
   * - 비과세 금액 = min(식대 20만원, 한도 20만원) = 20만원
   * - 과세 대상 실수령액 = 400만원 - 20만원 = 380만원
   * - 과세 대상 세전급여를 역산하여 380만원이 되도록 계산
   * - 총 세전급여 = 과세대상 세전급여 + 비과세 금액
   */
  calculateGrossFromNet(
    targetNetPay: number,
    options: {
      nationalPension?: boolean
      healthInsurance?: boolean
      longTermCare?: boolean
      employmentInsurance?: boolean
      incomeTaxEnabled?: boolean
      dependentsCount?: number
    } = {},
    allowances: Allowances = {}
  ): { grossPay: number; deductions: DeductionCalculation; actualNetPay: number; nonTaxableAmount: number } {
    // 비과세 금액 계산
    const nonTaxableCalc = this.calculateNonTaxableAmounts(allowances)
    const nonTaxableAmount = nonTaxableCalc.totalNonTaxable

    // 과세 대상 목표 실수령액 (총 목표 실수령액에서 비과세 금액 제외)
    // 비과세 금액은 공제 없이 그대로 지급되므로
    const targetTaxableNetPay = targetNetPay - nonTaxableAmount

    // 이진 탐색으로 과세 대상 세전 급여 찾기
    let low = targetTaxableNetPay  // 최소 세전 급여는 세후 급여 이상
    let high = Math.round(targetTaxableNetPay * 1.5)  // 최대 세전 급여 (약 50% 높게 설정)
    let bestTaxableGross = targetTaxableNetPay
    let bestDeductions = this.calculateDeductions(targetTaxableNetPay, options, 0)
    let bestTaxableNetPay = targetTaxableNetPay - bestDeductions.totalDeductions

    // 반복 탐색 (최대 50회)
    for (let i = 0; i < 50; i++) {
      const mid = Math.round((low + high) / 2)
      // 공제액 계산 (여기서 mid는 과세 대상 급여이므로 비과세=0)
      const deductions = this.calculateDeductions(mid, options, 0)
      const calculatedTaxableNetPay = mid - deductions.totalDeductions

      if (Math.abs(calculatedTaxableNetPay - targetTaxableNetPay) < Math.abs(bestTaxableNetPay - targetTaxableNetPay)) {
        bestTaxableGross = mid
        bestDeductions = deductions
        bestTaxableNetPay = calculatedTaxableNetPay
      }

      // 목표 실수령액과 충분히 가까우면 종료 (1원 이내)
      if (Math.abs(calculatedTaxableNetPay - targetTaxableNetPay) <= 1) {
        break
      }

      if (calculatedTaxableNetPay < targetTaxableNetPay) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    // 총 세전 급여 = 과세 대상 세전급여 + 비과세 금액
    const totalGrossPay = bestTaxableGross + nonTaxableAmount
    // 총 실수령액 = 과세 대상 실수령액 + 비과세 금액
    const actualNetPay = bestTaxableNetPay + nonTaxableAmount

    return {
      grossPay: totalGrossPay,
      deductions: bestDeductions,
      actualNetPay,
      nonTaxableAmount
    }
  }

  /**
   * 급여 전체 계산 (지급액, 공제액, 실수령액)
   * 비과세 수당을 고려하여 계산
   */
  calculatePayroll(
    baseSalary: number,
    allowances: Allowances,
    options: {
      overtimePay?: number
      bonus?: number
      otherEarnings?: number
      otherDeductions?: OtherDeductions
      nationalPension?: boolean
      healthInsurance?: boolean
      longTermCare?: boolean
      employmentInsurance?: boolean
      incomeTaxEnabled?: boolean
      dependentsCount?: number
    } = {}
  ): PayrollCalculation {
    const {
      overtimePay = 0,
      bonus = 0,
      otherEarnings = 0,
      otherDeductions = {},
      ...deductionOptions
    } = options

    // 총 지급액 계산
    const allowancesTotal = this.calculateAllowancesTotal(allowances)
    const totalEarnings = baseSalary + allowancesTotal + overtimePay + bonus + otherEarnings

    // 비과세 금액 계산
    const nonTaxableCalc = this.calculateNonTaxableAmounts(allowances)
    const nonTaxableAmount = nonTaxableCalc.totalNonTaxable

    // 공제액 계산 (비과세 금액 제외)
    const deductions = this.calculateDeductions(totalEarnings, deductionOptions, nonTaxableAmount)

    // 기타 공제액
    const otherDeductionsTotal = Object.values(otherDeductions).reduce((sum, val) => sum + (val || 0), 0)

    // 실수령액
    const netPay = totalEarnings - deductions.totalDeductions - otherDeductionsTotal

    return {
      totalEarnings,
      deductions: {
        ...deductions,
        totalDeductions: deductions.totalDeductions + otherDeductionsTotal
      },
      netPay
    }
  }

  // =====================================================================
  // 급여 설정 CRUD
  // =====================================================================

  /**
   * 병원의 모든 급여 설정 조회
   */
  async getPayrollSettings(clinicId: string): Promise<GetPayrollSettingsResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await supabase
        .from('payroll_settings')
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data: data as PayrollSetting[] }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 조회 실패'
      }
    }
  }

  /**
   * 특정 직원의 급여 설정 조회
   */
  async getPayrollSetting(clinicId: string, employeeUserId: string): Promise<GetPayrollSettingResponse> {
    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await supabase
        .from('payroll_settings')
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .eq('clinic_id', clinicId)
        .eq('employee_user_id', employeeUserId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, data: undefined }
        }
        return { success: false, error: error.message }
      }

      return { success: true, data: data as PayrollSetting }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 조회 실패'
      }
    }
  }

  /**
   * 급여 설정 저장 (생성 또는 업데이트)
   */
  async savePayrollSetting(
    clinicId: string,
    formData: PayrollSettingFormData,
    currentUserId: string
  ): Promise<SavePayrollSettingResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // 기존 설정 확인
      const { data: existing } = await supabase
        .from('payroll_settings')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('employee_user_id', formData.employee_user_id)
        .single()

      if (existing) {
        // 업데이트
        const { data, error } = await supabase
          .from('payroll_settings')
          .update({
            salary_type: formData.salary_type,
            base_salary: formData.base_salary,
            allowances: formData.allowances,
            payment_day: formData.payment_day,
            national_pension: formData.national_pension,
            health_insurance: formData.health_insurance,
            long_term_care: formData.long_term_care,
            employment_insurance: formData.employment_insurance,
            income_tax_enabled: formData.income_tax_enabled,
            dependents_count: formData.dependents_count,
            kakao_notification_enabled: formData.kakao_notification_enabled,
            kakao_phone_number: formData.kakao_phone_number,
            notes: formData.notes,
            updated_by: currentUserId
          })
          .eq('id', existing.id)
          .select(`
            *,
            employee:users!employee_user_id(id, name, email, phone, role)
          `)
          .single()

        if (error) {
          return { success: false, error: error.message }
        }
        return { success: true, data: data as PayrollSetting }
      } else {
        // 생성
        const { data, error } = await supabase
          .from('payroll_settings')
          .insert({
            clinic_id: clinicId,
            employee_user_id: formData.employee_user_id,
            salary_type: formData.salary_type,
            base_salary: formData.base_salary,
            allowances: formData.allowances,
            payment_day: formData.payment_day,
            national_pension: formData.national_pension,
            health_insurance: formData.health_insurance,
            long_term_care: formData.long_term_care,
            employment_insurance: formData.employment_insurance,
            income_tax_enabled: formData.income_tax_enabled,
            dependents_count: formData.dependents_count,
            kakao_notification_enabled: formData.kakao_notification_enabled,
            kakao_phone_number: formData.kakao_phone_number,
            notes: formData.notes,
            created_by: currentUserId
          })
          .select(`
            *,
            employee:users!employee_user_id(id, name, email, phone, role)
          `)
          .single()

        if (error) {
          return { success: false, error: error.message }
        }
        return { success: true, data: data as PayrollSetting }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 저장 실패'
      }
    }
  }

  /**
   * 급여 설정 삭제
   */
  async deletePayrollSetting(settingId: string): Promise<{ success: boolean; error?: string }> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { error } = await supabase
        .from('payroll_settings')
        .delete()
        .eq('id', settingId)

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 삭제 실패'
      }
    }
  }

  // =====================================================================
  // 급여 명세서 CRUD
  // =====================================================================

  /**
   * 급여 명세서 목록 조회
   */
  async getPayrollStatements(
    clinicId: string,
    filters?: PayrollStatementFilters
  ): Promise<GetPayrollStatementsResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      let query = supabase
        .from('payroll_statements')
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `, { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('payment_year', { ascending: false })
        .order('payment_month', { ascending: false })

      // 필터 적용
      if (filters?.employee_user_id) {
        query = query.eq('employee_user_id', filters.employee_user_id)
      }
      if (filters?.payment_year) {
        query = query.eq('payment_year', filters.payment_year)
      }
      if (filters?.payment_month) {
        query = query.eq('payment_month', filters.payment_month)
      }
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }

      const { data, error, count } = await query

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        data: data as PayrollStatement[],
        total: count || 0
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 조회 실패'
      }
    }
  }

  /**
   * 본인의 급여 명세서 목록 조회 (직원용)
   */
  async getMyPayrollStatements(userId: string): Promise<GetPayrollStatementsResponse> {
    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error, count } = await supabase
        .from('payroll_statements')
        .select('*', { count: 'exact' })
        .eq('employee_user_id', userId)
        .order('payment_year', { ascending: false })
        .order('payment_month', { ascending: false })

      if (error) {
        return { success: false, error: error.message }
      }

      return {
        success: true,
        data: data as PayrollStatement[],
        total: count || 0
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 조회 실패'
      }
    }
  }

  /**
   * 특정 급여 명세서 조회
   */
  async getPayrollStatement(statementId: string): Promise<GetPayrollStatementResponse> {
    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await supabase
        .from('payroll_statements')
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .eq('id', statementId)
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data: data as PayrollStatement }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 조회 실패'
      }
    }
  }

  /**
   * 급여 명세서 자동 생성 (특정 월)
   */
  async generatePayrollStatements(
    clinicId: string,
    year: number,
    month: number,
    currentUserId: string
  ): Promise<GeneratePayrollStatementsResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // 해당 병원의 모든 급여 설정 조회
      const { data: settings, error: settingsError } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('clinic_id', clinicId)

      if (settingsError) {
        return { success: false, error: settingsError.message }
      }

      if (!settings || settings.length === 0) {
        return { success: false, error: '등록된 급여 설정이 없습니다.' }
      }

      let createdCount = 0

      for (const setting of settings) {
        // 이미 해당 월의 명세서가 있는지 확인
        const { data: existing } = await supabase
          .from('payroll_statements')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('employee_user_id', setting.employee_user_id)
          .eq('payment_year', year)
          .eq('payment_month', month)
          .single()

        if (existing) {
          continue // 이미 존재하면 건너뜀
        }

        // 수당 총액 계산
        const allowancesTotal = this.calculateAllowancesTotal(setting.allowances || {})

        // 공제 옵션
        const deductionOptions = {
          nationalPension: setting.national_pension,
          healthInsurance: setting.health_insurance,
          longTermCare: setting.long_term_care,
          employmentInsurance: setting.employment_insurance,
          incomeTaxEnabled: setting.income_tax_enabled,
          dependentsCount: setting.dependents_count
        }

        let totalEarnings: number
        let deductions: DeductionCalculation
        let netPay: number
        let calculatedBaseSalary: number
        let calculatedAllowances: Allowances

        if (setting.salary_type === 'net') {
          // 세후 급여인 경우:
          // base_salary가 총 목표 실수령액 (수당 포함)
          // 수당은 그 금액의 구성 내역 (비과세 항목 지정용)
          // 예: 세후 400만원, 식대 20만원 → 총 실수령액 400만원, 그 중 식대 20만원은 비과세
          const targetNetPay = setting.base_salary  // 총 목표 실수령액
          const result = this.calculateGrossFromNet(targetNetPay, deductionOptions, setting.allowances || {})

          totalEarnings = result.grossPay
          deductions = result.deductions
          netPay = result.actualNetPay

          // 비과세 금액
          const nonTaxableAmount = result.nonTaxableAmount

          // 명세서에 표시할 기본급과 수당 계산
          // 수당은 원래 입력한 금액 유지 (비과세 항목)
          // 기본급 = 총 세전급여 - 수당 합계
          calculatedAllowances = setting.allowances || {}
          calculatedBaseSalary = totalEarnings - allowancesTotal
        } else {
          // 세전 급여인 경우: 기존 로직 사용
          const calculation = this.calculatePayroll(
            setting.base_salary,
            setting.allowances || {},
            deductionOptions
          )
          totalEarnings = calculation.totalEarnings
          deductions = calculation.deductions
          netPay = calculation.netPay
          calculatedBaseSalary = setting.base_salary
          calculatedAllowances = setting.allowances || {}
        }

        // 급여일 계산 (해당 월의 마지막 날을 초과하지 않도록)
        const lastDayOfMonth = new Date(year, month, 0).getDate()
        const paymentDay = Math.min(setting.payment_day, lastDayOfMonth)
        const paymentDate = `${year}-${String(month).padStart(2, '0')}-${String(paymentDay).padStart(2, '0')}`

        // 명세서 생성
        const { error: insertError } = await supabase
          .from('payroll_statements')
          .insert({
            clinic_id: clinicId,
            employee_user_id: setting.employee_user_id,
            payroll_setting_id: setting.id,
            payment_year: year,
            payment_month: month,
            payment_date: paymentDate,
            base_salary: calculatedBaseSalary,
            allowances: calculatedAllowances,
            total_earnings: totalEarnings,
            national_pension: deductions.nationalPension,
            health_insurance: deductions.healthInsurance,
            long_term_care: deductions.longTermCare,
            employment_insurance: deductions.employmentInsurance,
            income_tax: deductions.incomeTax,
            local_income_tax: deductions.localIncomeTax,
            total_deductions: deductions.totalDeductions,
            net_pay: netPay,
            status: 'draft',
            created_by: currentUserId
          })

        if (!insertError) {
          createdCount++
        }
      }

      return { success: true, count: createdCount }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 생성 실패'
      }
    }
  }

  /**
   * 급여 명세서 수동 생성/수정
   */
  async savePayrollStatement(
    clinicId: string,
    formData: PayrollStatementFormData,
    currentUserId: string,
    statementId?: string
  ): Promise<GetPayrollStatementResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // 직원의 급여 설정 조회
      const { data: setting } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('employee_user_id', formData.employee_user_id)
        .single()

      // 급여 계산
      const calculation = this.calculatePayroll(
        formData.base_salary,
        formData.allowances,
        {
          overtimePay: formData.overtime_pay,
          bonus: formData.bonus,
          otherEarnings: formData.other_earnings,
          otherDeductions: formData.other_deductions,
          nationalPension: setting?.national_pension ?? true,
          healthInsurance: setting?.health_insurance ?? true,
          longTermCare: setting?.long_term_care ?? true,
          employmentInsurance: setting?.employment_insurance ?? true,
          incomeTaxEnabled: setting?.income_tax_enabled ?? true,
          dependentsCount: setting?.dependents_count ?? 1
        }
      )

      const statementData = {
        clinic_id: clinicId,
        employee_user_id: formData.employee_user_id,
        payroll_setting_id: setting?.id,
        payment_year: formData.payment_year,
        payment_month: formData.payment_month,
        payment_date: formData.payment_date,
        base_salary: formData.base_salary,
        allowances: formData.allowances,
        overtime_pay: formData.overtime_pay || 0,
        bonus: formData.bonus || 0,
        other_earnings: formData.other_earnings || 0,
        total_earnings: calculation.totalEarnings,
        national_pension: calculation.deductions.nationalPension,
        health_insurance: calculation.deductions.healthInsurance,
        long_term_care: calculation.deductions.longTermCare,
        employment_insurance: calculation.deductions.employmentInsurance,
        income_tax: calculation.deductions.incomeTax,
        local_income_tax: calculation.deductions.localIncomeTax,
        other_deductions: formData.other_deductions || {},
        total_deductions: calculation.deductions.totalDeductions,
        net_pay: calculation.netPay,
        work_days: formData.work_days || 0,
        overtime_hours: formData.overtime_hours || 0,
        leave_days: formData.leave_days || 0,
        notes: formData.notes
      }

      if (statementId) {
        // 업데이트
        const { data, error } = await supabase
          .from('payroll_statements')
          .update(statementData)
          .eq('id', statementId)
          .select(`
            *,
            employee:users!employee_user_id(id, name, email, phone, role)
          `)
          .single()

        if (error) {
          return { success: false, error: error.message }
        }
        return { success: true, data: data as PayrollStatement }
      } else {
        // 생성
        const { data, error } = await supabase
          .from('payroll_statements')
          .insert({
            ...statementData,
            status: 'draft',
            created_by: currentUserId
          })
          .select(`
            *,
            employee:users!employee_user_id(id, name, email, phone, role)
          `)
          .single()

        if (error) {
          return { success: false, error: error.message }
        }
        return { success: true, data: data as PayrollStatement }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 저장 실패'
      }
    }
  }

  /**
   * 급여 명세서 확정
   */
  async confirmPayrollStatement(
    statementId: string,
    currentUserId: string
  ): Promise<GetPayrollStatementResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { data, error } = await supabase
        .from('payroll_statements')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: currentUserId
        })
        .eq('id', statementId)
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data: data as PayrollStatement }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 확정 실패'
      }
    }
  }

  /**
   * 급여 명세서 삭제
   */
  async deletePayrollStatement(statementId: string): Promise<{ success: boolean; error?: string }> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { error } = await supabase
        .from('payroll_statements')
        .delete()
        .eq('id', statementId)

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 삭제 실패'
      }
    }
  }

  /**
   * 급여 명세서 열람 기록
   */
  async markStatementAsViewed(statementId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      const { error } = await supabase
        .from('payroll_statements')
        .update({
          status: 'viewed',
          viewed_at: new Date().toISOString()
        })
        .eq('id', statementId)
        .in('status', ['confirmed', 'sent'])

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '열람 기록 실패'
      }
    }
  }

  // =====================================================================
  // 카카오톡 발송 관련
  // =====================================================================

  /**
   * 카카오톡 알림 발송 (실제 구현은 외부 API 연동 필요)
   */
  async sendKakaoNotification(
    statementId: string,
    phoneNumber: string,
    currentUserId: string
  ): Promise<SendKakaoNotificationResponse> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Database connection failed' }
    }

    try {
      // 명세서 조회
      const { data: statement, error: statementError } = await supabase
        .from('payroll_statements')
        .select(`
          *,
          employee:users!employee_user_id(name)
        `)
        .eq('id', statementId)
        .single()

      if (statementError || !statement) {
        return { success: false, error: '급여 명세서를 찾을 수 없습니다.' }
      }

      // 메시지 내용 생성
      const employeeName = (statement.employee as any)?.name || '직원'
      const messageContent = `[급여 명세서 안내]

${employeeName}님의 ${statement.payment_year}년 ${statement.payment_month}월 급여 명세서가 발급되었습니다.

총 지급액: ${statement.total_earnings.toLocaleString()}원
공제 합계: ${statement.total_deductions.toLocaleString()}원
실수령액: ${statement.net_pay.toLocaleString()}원

자세한 내용은 치과 관리 시스템에서 확인해 주세요.`

      // 발송 로그 생성 (실제 발송은 외부 API 연동 필요)
      const { data: log, error: logError } = await supabase
        .from('payroll_kakao_logs')
        .insert({
          payroll_statement_id: statementId,
          phone_number: phoneNumber,
          message_content: messageContent,
          status: 'sent', // 실제로는 API 호출 후 결과에 따라 업데이트
          sent_at: new Date().toISOString(),
          created_by: currentUserId
        })
        .select()
        .single()

      if (logError) {
        return { success: false, error: logError.message }
      }

      // 명세서 상태 업데이트
      await supabase
        .from('payroll_statements')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', statementId)

      return { success: true, log: log as PayrollKakaoLog }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '카카오톡 발송 실패'
      }
    }
  }

  /**
   * 일괄 카카오톡 발송
   */
  async sendBulkKakaoNotifications(
    clinicId: string,
    year: number,
    month: number,
    currentUserId: string
  ): Promise<{ success: boolean; sentCount: number; failedCount: number; error?: string }> {
    const sessionCheck = await this.checkSession()
    if (sessionCheck.error) {
      return { success: false, sentCount: 0, failedCount: 0, error: sessionCheck.error }
    }

    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, sentCount: 0, failedCount: 0, error: 'Database connection failed' }
    }

    try {
      // 확정된 명세서 중 카카오톡 발송이 활성화된 직원만 조회
      const { data: statements, error: statementsError } = await supabase
        .from('payroll_statements')
        .select(`
          id,
          employee_user_id,
          payroll_setting:payroll_settings!payroll_setting_id(
            kakao_notification_enabled,
            kakao_phone_number
          )
        `)
        .eq('clinic_id', clinicId)
        .eq('payment_year', year)
        .eq('payment_month', month)
        .eq('status', 'confirmed')

      if (statementsError) {
        return { success: false, sentCount: 0, failedCount: 0, error: statementsError.message }
      }

      let sentCount = 0
      let failedCount = 0

      for (const statement of statements || []) {
        const setting = statement.payroll_setting as any
        if (setting?.kakao_notification_enabled && setting?.kakao_phone_number) {
          const result = await this.sendKakaoNotification(
            statement.id,
            setting.kakao_phone_number,
            currentUserId
          )
          if (result.success) {
            sentCount++
          } else {
            failedCount++
          }
        }
      }

      return { success: true, sentCount, failedCount }
    } catch (error) {
      return {
        success: false,
        sentCount: 0,
        failedCount: 0,
        error: error instanceof Error ? error.message : '일괄 발송 실패'
      }
    }
  }
}

// Export singleton instance
export const payrollService = new PayrollService()
