/**
 * 급여 명세서 API 라우트
 * GET: 급여 명세서 목록 조회
 * POST: 급여 명세서 생성/업데이트
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

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinic_id')
    const employeeUserId = searchParams.get('employee_user_id')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const status = searchParams.get('status')
    const myOnly = searchParams.get('my_only') // 본인 것만 조회

    let query = supabase
      .from('payroll_statements')
      .select(`
        *,
        employee:users!employee_user_id(id, name, email, phone, role)
      `)
      .order('payment_year', { ascending: false })
      .order('payment_month', { ascending: false })

    if (clinicId) {
      query = query.eq('clinic_id', clinicId)
    }

    if (employeeUserId) {
      query = query.eq('employee_user_id', employeeUserId)
    }

    if (year) {
      query = query.eq('payment_year', parseInt(year))
    }

    if (month) {
      query = query.eq('payment_month', parseInt(month))
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Get payroll statements error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, total: count })
  } catch (error) {
    console.error('Get payroll statements error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await request.json()
    const {
      id, // 수정 시
      clinic_id,
      employee_user_id,
      payment_year,
      payment_month,
      payment_date,
      base_salary,
      allowances,
      overtime_pay,
      bonus,
      other_earnings,
      other_deductions,
      work_days,
      overtime_hours,
      leave_days,
      notes,
      current_user_id
    } = body

    if (!clinic_id || !employee_user_id || !payment_year || !payment_month) {
      return NextResponse.json(
        { success: false, error: 'Required fields missing' },
        { status: 400 }
      )
    }

    // 직원의 급여 설정 조회
    const { data: setting } = await supabase
      .from('payroll_settings')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('employee_user_id', employee_user_id)
      .single()

    // 수당 합계
    const allowancesTotal = Object.values(allowances || {}).reduce(
      (sum: number, val: any) => sum + (Number(val) || 0), 0
    )

    // 총 지급액
    const totalEarnings = (base_salary || 0) + allowancesTotal +
                          (overtime_pay || 0) + (bonus || 0) + (other_earnings || 0)

    // 공제액 계산
    const deductions = calculateDeductions(totalEarnings, {
      nationalPension: setting?.national_pension ?? true,
      healthInsurance: setting?.health_insurance ?? true,
      longTermCare: setting?.long_term_care ?? true,
      employmentInsurance: setting?.employment_insurance ?? true,
      incomeTaxEnabled: setting?.income_tax_enabled ?? true,
      dependentsCount: setting?.dependents_count ?? 1
    })

    // 기타 공제액
    const otherDeductionsTotal = Object.values(other_deductions || {}).reduce(
      (sum: number, val: any) => sum + (Number(val) || 0), 0
    )

    const totalDeductions = deductions.totalDeductions + otherDeductionsTotal
    const netPay = totalEarnings - totalDeductions

    const statementData = {
      clinic_id,
      employee_user_id,
      payroll_setting_id: setting?.id,
      payment_year,
      payment_month,
      payment_date,
      base_salary: base_salary || 0,
      allowances: allowances || {},
      overtime_pay: overtime_pay || 0,
      bonus: bonus || 0,
      other_earnings: other_earnings || 0,
      total_earnings: totalEarnings,
      national_pension: deductions.nationalPension,
      health_insurance: deductions.healthInsurance,
      long_term_care: deductions.longTermCare,
      employment_insurance: deductions.employmentInsurance,
      income_tax: deductions.incomeTax,
      local_income_tax: deductions.localIncomeTax,
      other_deductions: other_deductions || {},
      total_deductions: totalDeductions,
      net_pay: netPay,
      work_days: work_days || 0,
      overtime_hours: overtime_hours || 0,
      leave_days: leave_days || 0,
      notes: notes || null
    }

    let data, error

    if (id) {
      // 업데이트
      const result = await supabase
        .from('payroll_statements')
        .update(statementData)
        .eq('id', id)
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .single()

      data = result.data
      error = result.error
    } else {
      // 생성
      const result = await supabase
        .from('payroll_statements')
        .insert({
          ...statementData,
          status: 'draft',
          created_by: current_user_id
        })
        .select(`
          *,
          employee:users!employee_user_id(id, name, email, phone, role)
        `)
        .single()

      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Save payroll statement error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Save payroll statement error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { searchParams } = new URL(request.url)
    const statementId = searchParams.get('id')

    if (!statementId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('payroll_statements')
      .delete()
      .eq('id', statementId)

    if (error) {
      console.error('Delete payroll statement error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete payroll statement error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
