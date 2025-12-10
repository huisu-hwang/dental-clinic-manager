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

function calculateDeductions(
  totalEarnings: number,
  options: {
    nationalPension?: boolean
    healthInsurance?: boolean
    longTermCare?: boolean
    employmentInsurance?: boolean
    incomeTaxEnabled?: boolean
    dependentsCount?: number
  } = {}
) {
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

      // 총 지급액
      const totalEarnings = setting.base_salary + allowancesTotal

      // 공제액 계산
      const deductions = calculateDeductions(totalEarnings, {
        nationalPension: setting.national_pension,
        healthInsurance: setting.health_insurance,
        longTermCare: setting.long_term_care,
        employmentInsurance: setting.employment_insurance,
        incomeTaxEnabled: setting.income_tax_enabled,
        dependentsCount: setting.dependents_count
      })

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
          base_salary: setting.base_salary,
          allowances: setting.allowances || {},
          total_earnings: totalEarnings,
          national_pension: deductions.nationalPension,
          health_insurance: deductions.healthInsurance,
          long_term_care: deductions.longTermCare,
          employment_insurance: deductions.employmentInsurance,
          income_tax: deductions.incomeTax,
          local_income_tax: deductions.localIncomeTax,
          total_deductions: deductions.totalDeductions,
          net_pay: totalEarnings - deductions.totalDeductions,
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
