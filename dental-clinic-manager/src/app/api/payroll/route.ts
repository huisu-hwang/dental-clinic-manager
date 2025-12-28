/**
 * Payroll Statement API Route
 * 급여 명세서 저장/조회/수정 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create Supabase client with service role key (server-side only)
const getServiceRoleClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * POST /api/payroll
 * 급여 명세서 저장 (신규 생성 또는 업데이트)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      clinicId,
      employeeId,
      statementYear,
      statementMonth,
      paymentDate,
      employeeName,
      employeeResidentNumber,
      hireDate,
      salaryType,
      payments,
      totalPayment,
      deductions,
      totalDeduction,
      netPay,
      nonTaxableTotal,
      workInfo,
      insuranceSettings,
      createdBy
    } = body

    if (!clinicId || !employeeId || !statementYear || !statementMonth) {
      return NextResponse.json(
        { success: false, error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    // 기존 명세서 확인 (같은 직원, 같은 연월)
    const { data: existing, error: checkError } = await supabase
      .from('payroll_statements')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('employee_id', employeeId)
      .eq('statement_year', statementYear)
      .eq('statement_month', statementMonth)
      .maybeSingle()

    if (checkError) {
      console.error('[API] Error checking existing payroll:', checkError)
    }

    const payrollData = {
      clinic_id: clinicId,
      employee_id: employeeId,
      statement_year: statementYear,
      statement_month: statementMonth,
      payment_date: paymentDate,
      employee_name: employeeName,
      employee_resident_number: employeeResidentNumber,
      hire_date: hireDate,
      salary_type: salaryType,
      payments,
      total_payment: totalPayment,
      deductions,
      total_deduction: totalDeduction,
      net_pay: netPay,
      non_taxable_total: nonTaxableTotal,
      work_info: workInfo,
      insurance_settings: insuranceSettings,
      updated_at: new Date().toISOString()
    }

    let result
    if (existing?.id) {
      // 업데이트
      const { data, error } = await supabase
        .from('payroll_statements')
        .update(payrollData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('[API] Error updating payroll:', error)
        return NextResponse.json(
          { success: false, error: `명세서 수정 실패: ${error.message}` },
          { status: 500 }
        )
      }
      result = { ...data, isNew: false }
    } else {
      // 신규 생성
      const { data, error } = await supabase
        .from('payroll_statements')
        .insert({
          ...payrollData,
          created_by: createdBy,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('[API] Error creating payroll:', error)
        return NextResponse.json(
          { success: false, error: `명세서 저장 실패: ${error.message}` },
          { status: 500 }
        )
      }
      result = { ...data, isNew: true }
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: result.isNew ? '급여 명세서가 저장되었습니다.' : '급여 명세서가 수정되었습니다.'
    })

  } catch (error) {
    console.error('[API] Payroll save error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 저장 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/payroll
 * 급여 명세서 조회
 * Query params: clinicId, employeeId?, year?, month?
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const employeeId = searchParams.get('employeeId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('payroll_statements')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('statement_year', { ascending: false })
      .order('statement_month', { ascending: false })

    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }
    if (year) {
      query = query.eq('statement_year', parseInt(year))
    }
    if (month) {
      query = query.eq('statement_month', parseInt(month))
    }

    const { data, error } = await query

    if (error) {
      console.error('[API] Error fetching payroll:', error)
      return NextResponse.json(
        { success: false, error: `명세서 조회 실패: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })

  } catch (error) {
    console.error('[API] Payroll fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 조회 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/payroll
 * 급여 명세서 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: '명세서 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('payroll_statements')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API] Error deleting payroll:', error)
      return NextResponse.json(
        { success: false, error: `명세서 삭제 실패: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '급여 명세서가 삭제되었습니다.'
    })

  } catch (error) {
    console.error('[API] Payroll delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '급여 명세서 삭제 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}
