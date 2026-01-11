/**
 * Payroll Settings API Route
 * 급여 설정 저장/조회 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
 * POST /api/payroll/settings
 * 급여 설정 저장 (신규 생성 또는 업데이트)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      clinicId,
      employeeId,
      salaryType,
      targetAmount,
      baseSalary,
      mealAllowance,
      vehicleAllowance,
      bonus,
      nationalPension,
      healthInsurance,
      longTermCare,
      employmentInsurance,
      familyCount,
      childCount,
      otherDeductions,
      updatedBy,
      // 근태 차감/수당 옵션
      deductLateMinutes,
      deductEarlyLeaveMinutes,
      includeOvertimePay,
      // 적용 범위 옵션
      applyToPast
    } = body

    if (!clinicId || !employeeId) {
      return NextResponse.json(
        { success: false, error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    // 기존 설정 확인
    const { data: existing, error: checkError } = await supabase
      .from('employee_salary_settings')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('employee_user_id', employeeId)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[API] Error checking existing settings:', checkError)
    }

    const settingsData = {
      clinic_id: clinicId,
      employee_user_id: employeeId,
      salary_type: salaryType,
      target_amount: targetAmount || 0,
      base_salary: baseSalary || 0,
      meal_allowance: mealAllowance || 0,
      vehicle_allowance: vehicleAllowance || 0,
      bonus: bonus || 0,
      national_pension: nationalPension || 0,
      health_insurance: healthInsurance || 0,
      long_term_care: longTermCare || 0,
      employment_insurance: employmentInsurance || 0,
      family_count: familyCount || 1,
      child_count: childCount || 0,
      other_deductions: otherDeductions || 0,
      // 근태 차감/수당 옵션 (기본값: true)
      deduct_late_minutes: deductLateMinutes !== undefined ? deductLateMinutes : true,
      deduct_early_leave_minutes: deductEarlyLeaveMinutes !== undefined ? deductEarlyLeaveMinutes : true,
      include_overtime_pay: includeOvertimePay !== undefined ? includeOvertimePay : true,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy
    }

    let result
    if (existing?.id) {
      // 업데이트
      const { data, error } = await supabase
        .from('employee_salary_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('[API] Error updating settings:', error)
        return NextResponse.json(
          { success: false, error: `설정 수정 실패: ${error.message}` },
          { status: 500 }
        )
      }
      result = data
    } else {
      // 신규 생성
      const { data, error } = await supabase
        .from('employee_salary_settings')
        .insert({
          ...settingsData,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('[API] Error creating settings:', error)
        return NextResponse.json(
          { success: false, error: `설정 저장 실패: ${error.message}` },
          { status: 500 }
        )
      }
      result = data
    }

    // 과거 급여명세서에도 적용하는 경우
    let updatedStatementsCount = 0
    if (applyToPast) {
      // 해당 직원의 모든 급여명세서 조회
      const { data: statements, error: fetchError } = await supabase
        .from('payroll_statements')
        .select('id, payments, deductions')
        .eq('clinic_id', clinicId)
        .eq('employee_user_id', employeeId)

      if (fetchError) {
        console.error('[API] Error fetching past statements:', fetchError)
      } else if (statements && statements.length > 0) {
        // 각 급여명세서 업데이트
        for (const statement of statements) {
          const updatedPayments = {
            ...statement.payments,
            baseSalary: baseSalary || statement.payments?.baseSalary || 0,
            mealAllowance: mealAllowance || statement.payments?.mealAllowance || 0,
            vehicleAllowance: vehicleAllowance || statement.payments?.vehicleAllowance || 0,
            bonus: bonus || statement.payments?.bonus || 0
          }

          const updatedDeductions = {
            ...statement.deductions,
            nationalPension: nationalPension || statement.deductions?.nationalPension || 0,
            healthInsurance: healthInsurance || statement.deductions?.healthInsurance || 0,
            longTermCare: longTermCare || statement.deductions?.longTermCare || 0,
            employmentInsurance: employmentInsurance || statement.deductions?.employmentInsurance || 0,
            otherDeductions: otherDeductions || statement.deductions?.otherDeductions || 0
          }

          // 총 지급액 계산
          const totalPayment = Object.values(updatedPayments).reduce((sum: number, val) => sum + (Number(val) || 0), 0)

          // 총 공제액 계산 (소득세, 지방소득세는 기존 값 유지)
          const totalDeduction = (updatedDeductions.nationalPension || 0) +
            (updatedDeductions.healthInsurance || 0) +
            (updatedDeductions.longTermCare || 0) +
            (updatedDeductions.employmentInsurance || 0) +
            (updatedDeductions.incomeTax || statement.deductions?.incomeTax || 0) +
            (updatedDeductions.localIncomeTax || statement.deductions?.localIncomeTax || 0) +
            (updatedDeductions.otherDeductions || 0)

          const netPay = totalPayment - totalDeduction

          const { error: updateError } = await supabase
            .from('payroll_statements')
            .update({
              salary_type: salaryType,
              payments: updatedPayments,
              total_payment: totalPayment,
              deductions: { ...statement.deductions, ...updatedDeductions },
              total_deduction: totalDeduction,
              net_pay: netPay,
              updated_at: new Date().toISOString()
            })
            .eq('id', statement.id)

          if (updateError) {
            console.error(`[API] Error updating statement ${statement.id}:`, updateError)
          } else {
            updatedStatementsCount++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: applyToPast
        ? `급여 설정이 저장되었습니다. ${updatedStatementsCount}개의 과거 급여명세서가 업데이트되었습니다.`
        : '급여 설정이 저장되었습니다.',
      updatedStatementsCount
    })

  } catch (error) {
    console.error('[API] Payroll settings save error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 저장 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/payroll/settings
 * 급여 설정 조회
 * Query params: clinicId, employeeId?
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const employeeId = searchParams.get('employeeId')

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('employee_salary_settings')
      .select('*')
      .eq('clinic_id', clinicId)

    if (employeeId) {
      query = query.eq('employee_user_id', employeeId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API] Error fetching settings:', error)
      return NextResponse.json(
        { success: false, error: `설정 조회 실패: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })

  } catch (error) {
    console.error('[API] Payroll settings fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '급여 설정 조회 중 오류가 발생했습니다.'
      },
      { status: 500 }
    )
  }
}
