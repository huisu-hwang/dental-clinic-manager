/**
 * 급여 명세서 자동 생성 API
 * POST: 특정 월의 급여 명세서 일괄 생성
 * 비과세 수당을 고려한 계산
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 4대보험 요율 상수
const RATES = {
  nationalPension: 0.045,
  healthInsurance: 0.03545,
  longTermCare: 0.1295,
  employmentInsurance: 0.009,
}

// 비과세 수당 한도 (월 기준)
const NON_TAXABLE_LIMITS: Record<string, number> = {
  meal: 200000,           // 식대: 월 20만원 한도
  vehicle: 200000,        // 자가운전보조금: 월 20만원 한도
  childcare: 200000,      // 자녀보육수당: 월 20만원 한도
}

// 수당명과 비과세 타입 매핑
const ALLOWANCE_TO_NON_TAXABLE_TYPE: Record<string, string> = {
  '식대': 'meal',
  '자가운전보조금': 'vehicle',
  '자녀보육수당': 'childcare',
}

interface DeductionOptions {
  nationalPension?: boolean
  healthInsurance?: boolean
  longTermCare?: boolean
  employmentInsurance?: boolean
  incomeTaxEnabled?: boolean
  dependentsCount?: number
}

interface DeductionResult {
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number
  incomeTax: number
  localIncomeTax: number
  totalDeductions: number
}

interface Allowances {
  [key: string]: number
}

/**
 * 비과세 금액 계산
 */
function calculateNonTaxableAmount(allowances: Allowances): number {
  let totalNonTaxable = 0

  for (const [name, amount] of Object.entries(allowances)) {
    const nonTaxableType = ALLOWANCE_TO_NON_TAXABLE_TYPE[name]
    if (nonTaxableType && amount > 0) {
      const limit = NON_TAXABLE_LIMITS[nonTaxableType] || 0
      totalNonTaxable += Math.min(amount, limit)
    }
  }

  return totalNonTaxable
}

/**
 * 4대보험 및 세금 공제액 계산
 * @param totalEarnings - 총 급여 (세전)
 * @param options - 공제 옵션
 * @param nonTaxableAmount - 비과세 금액 (공제 대상에서 제외)
 */
function calculateDeductions(
  totalEarnings: number,
  options: DeductionOptions = {},
  nonTaxableAmount: number = 0
): DeductionResult {
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

  // 소득세 (간이세액 기준)
  let incomeTax = 0
  if (incomeTaxEnabled) {
    const taxableIncome = Math.max(0, taxableEarnings - (dependentsCount * 125000))
    incomeTax = Math.round(taxableIncome * 0.033)
  }
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
 * 비과세 수당을 고려하여 계산
 *
 * 예시: 세후 400만원, 식대 20만원 설정 시
 * - 비과세 금액 = min(식대 20만원, 한도 20만원) = 20만원
 * - 과세 대상 실수령액 = 400만원 - 20만원 = 380만원
 * - 과세 대상 세전급여를 역산하여 380만원이 되도록 계산
 * - 총 세전급여 = 과세대상 세전급여 + 비과세 금액
 */
function calculateGrossFromNet(
  targetNetPay: number,
  options: DeductionOptions = {},
  allowances: Allowances = {}
): { grossPay: number; deductions: DeductionResult; actualNetPay: number; nonTaxableAmount: number } {
  // 비과세 금액 계산
  const nonTaxableAmount = calculateNonTaxableAmount(allowances)

  // 과세 대상 목표 실수령액 (총 목표 실수령액에서 비과세 금액 제외)
  const targetTaxableNetPay = targetNetPay - nonTaxableAmount

  // 이진 탐색으로 과세 대상 세전 급여 찾기
  let low = targetTaxableNetPay
  let high = Math.round(targetTaxableNetPay * 1.5)
  let bestTaxableGross = targetTaxableNetPay
  let bestDeductions = calculateDeductions(targetTaxableNetPay, options, 0)
  let bestTaxableNetPay = targetTaxableNetPay - bestDeductions.totalDeductions

  for (let i = 0; i < 50; i++) {
    const mid = Math.round((low + high) / 2)
    const deductions = calculateDeductions(mid, options, 0)
    const calculatedTaxableNetPay = mid - deductions.totalDeductions

    if (Math.abs(calculatedTaxableNetPay - targetTaxableNetPay) < Math.abs(bestTaxableNetPay - targetTaxableNetPay)) {
      bestTaxableGross = mid
      bestDeductions = deductions
      bestTaxableNetPay = calculatedTaxableNetPay
    }

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

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await request.json()
    const { clinic_id, year, month, current_user_id } = body

    if (!clinic_id || !year || !month) {
      return NextResponse.json(
        { success: false, error: 'clinic_id, year, month are required' },
        { status: 400 }
      )
    }

    // 해당 병원의 모든 급여 설정 조회
    const { data: settings, error: settingsError } = await supabase
      .from('payroll_settings')
      .select('*')
      .eq('clinic_id', clinic_id)

    if (settingsError) {
      return NextResponse.json({ success: false, error: settingsError.message }, { status: 500 })
    }

    if (!settings || settings.length === 0) {
      return NextResponse.json(
        { success: false, error: '등록된 급여 설정이 없습니다.' },
        { status: 400 }
      )
    }

    let createdCount = 0
    let skippedCount = 0

    for (const setting of settings) {
      // 이미 해당 월의 명세서가 있는지 확인
      const { data: existing } = await supabase
        .from('payroll_statements')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('employee_user_id', setting.employee_user_id)
        .eq('payment_year', year)
        .eq('payment_month', month)
        .single()

      if (existing) {
        skippedCount++
        continue
      }

      // 수당 합계
      const allowancesTotal = Object.values(setting.allowances || {}).reduce(
        (sum: number, val: any) => sum + (Number(val) || 0), 0
      )

      // 입력된 급여 (기본급 + 수당)
      const inputSalary = setting.base_salary + allowancesTotal

      // 공제 옵션
      const deductionOptions: DeductionOptions = {
        nationalPension: setting.national_pension,
        healthInsurance: setting.health_insurance,
        longTermCare: setting.long_term_care,
        employmentInsurance: setting.employment_insurance,
        incomeTaxEnabled: setting.income_tax_enabled,
        dependentsCount: setting.dependents_count
      }

      let totalEarnings: number
      let deductions: DeductionResult
      let netPay: number
      let calculatedBaseSalary: number
      let calculatedAllowances: Record<string, number>

      if (setting.salary_type === 'net') {
        // 세후 급여인 경우: 비과세 수당을 고려하여 세전 급여 역산
        const targetNetPay = inputSalary
        const result = calculateGrossFromNet(targetNetPay, deductionOptions, setting.allowances || {})

        totalEarnings = result.grossPay
        deductions = result.deductions
        netPay = result.actualNetPay

        // 비과세 금액 계산
        const nonTaxableAmount = result.nonTaxableAmount

        // 역산된 세전 급여를 기본급과 수당에 분배
        const inputAllowancesTotal = allowancesTotal
        const taxableAllowancesTotal = inputAllowancesTotal - nonTaxableAmount
        const taxableGrossPay = result.grossPay - nonTaxableAmount

        if (inputSalary > 0 && (setting.base_salary + taxableAllowancesTotal) > 0) {
          const taxableInput = setting.base_salary + taxableAllowancesTotal
          const ratio = taxableGrossPay / taxableInput
          calculatedBaseSalary = Math.round(setting.base_salary * ratio)

          // 수당은 비과세 부분은 유지, 과세 부분만 비율 적용
          calculatedAllowances = {}
          for (const [key, value] of Object.entries(setting.allowances || {})) {
            const amount = Number(value) || 0
            const nonTaxableType = ALLOWANCE_TO_NON_TAXABLE_TYPE[key]
            if (nonTaxableType) {
              // 비과세 수당은 원래 금액 유지 (한도 내)
              const limit = NON_TAXABLE_LIMITS[nonTaxableType] || 0
              const nonTaxable = Math.min(amount, limit)
              const taxable = amount - nonTaxable
              calculatedAllowances[key] = nonTaxable + Math.round(taxable * ratio)
            } else {
              // 과세 수당은 비율 적용
              calculatedAllowances[key] = Math.round(amount * ratio)
            }
          }
        } else {
          calculatedBaseSalary = taxableGrossPay
          calculatedAllowances = setting.allowances || {}
        }
      } else {
        // 세전 급여인 경우: 비과세 금액 계산 후 공제액 계산
        const nonTaxableAmount = calculateNonTaxableAmount(setting.allowances || {})
        totalEarnings = inputSalary
        deductions = calculateDeductions(totalEarnings, deductionOptions, nonTaxableAmount)
        netPay = totalEarnings - deductions.totalDeductions
        calculatedBaseSalary = setting.base_salary
        calculatedAllowances = setting.allowances || {}
      }

      // 급여일 계산
      const lastDayOfMonth = new Date(year, month, 0).getDate()
      const paymentDay = Math.min(setting.payment_day, lastDayOfMonth)
      const paymentDate = `${year}-${String(month).padStart(2, '0')}-${String(paymentDay).padStart(2, '0')}`

      // 명세서 생성
      const { error: insertError } = await supabase
        .from('payroll_statements')
        .insert({
          clinic_id,
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
          created_by: current_user_id
        })

      if (!insertError) {
        createdCount++
      }
    }

    return NextResponse.json({
      success: true,
      count: createdCount,
      skipped: skippedCount,
      message: `${createdCount}개의 급여 명세서가 생성되었습니다.${skippedCount > 0 ? ` (${skippedCount}개 건너뜀)` : ''}`
    })
  } catch (error) {
    console.error('Generate payroll statements error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
