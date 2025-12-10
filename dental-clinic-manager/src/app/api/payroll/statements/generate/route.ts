/**
 * 급여 명세서 자동 생성 API
 * POST: 특정 월의 급여 명세서 일괄 생성
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

function calculateDeductions(
  totalEarnings: number,
  options: DeductionOptions = {}
): DeductionResult {
  const {
    nationalPension = true,
    healthInsurance = true,
    longTermCare = true,
    employmentInsurance = true,
    incomeTaxEnabled = true,
    dependentsCount = 1
  } = options

  const pensionBase = Math.min(totalEarnings, 5900000)
  const nationalPensionAmount = nationalPension ? Math.round(pensionBase * RATES.nationalPension) : 0
  const healthInsuranceAmount = healthInsurance ? Math.round(totalEarnings * RATES.healthInsurance) : 0
  const longTermCareAmount = longTermCare ? Math.round(healthInsuranceAmount * RATES.longTermCare) : 0
  const employmentInsuranceAmount = employmentInsurance ? Math.round(totalEarnings * RATES.employmentInsurance) : 0

  let incomeTax = 0
  if (incomeTaxEnabled) {
    const taxableIncome = Math.max(0, totalEarnings - (dependentsCount * 125000))
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
 * 이진 탐색을 사용하여 목표 실수령액에 맞는 세전 급여 계산
 */
function calculateGrossFromNet(
  targetNetPay: number,
  options: DeductionOptions = {}
): { grossPay: number; deductions: DeductionResult; actualNetPay: number } {
  let low = targetNetPay
  let high = Math.round(targetNetPay * 1.5)
  let bestGross = targetNetPay
  let bestDeductions = calculateDeductions(targetNetPay, options)
  let bestNetPay = targetNetPay - bestDeductions.totalDeductions

  for (let i = 0; i < 50; i++) {
    const mid = Math.round((low + high) / 2)
    const deductions = calculateDeductions(mid, options)
    const calculatedNetPay = mid - deductions.totalDeductions

    if (Math.abs(calculatedNetPay - targetNetPay) < Math.abs(bestNetPay - targetNetPay)) {
      bestGross = mid
      bestDeductions = deductions
      bestNetPay = calculatedNetPay
    }

    if (Math.abs(calculatedNetPay - targetNetPay) <= 1) {
      break
    }

    if (calculatedNetPay < targetNetPay) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return {
    grossPay: bestGross,
    deductions: bestDeductions,
    actualNetPay: bestNetPay
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
        // 세후 급여인 경우: 입력된 금액을 실수령액으로 보고 세전 급여 역산
        const targetNetPay = inputSalary
        const result = calculateGrossFromNet(targetNetPay, deductionOptions)

        totalEarnings = result.grossPay
        deductions = result.deductions
        netPay = result.actualNetPay

        // 역산된 세전 급여를 기본급과 수당 비율로 분배
        if (inputSalary > 0) {
          const ratio = result.grossPay / inputSalary
          calculatedBaseSalary = Math.round(setting.base_salary * ratio)
          calculatedAllowances = {}
          for (const [key, value] of Object.entries(setting.allowances || {})) {
            calculatedAllowances[key] = Math.round((Number(value) || 0) * ratio)
          }
        } else {
          calculatedBaseSalary = result.grossPay
          calculatedAllowances = {}
        }
      } else {
        // 세전 급여인 경우: 기존 로직 사용
        totalEarnings = inputSalary
        deductions = calculateDeductions(totalEarnings, deductionOptions)
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
