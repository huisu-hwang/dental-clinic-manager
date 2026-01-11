/**
 * Payroll Settings API Route
 * 급여 설정 저장/조회 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  calculatePayrollBasis,
  calculateAttendanceDeduction,
  calculatePayrollFromFormState,
  type AttendanceDeductionOptions
} from '@/lib/payrollService'
import type { PayrollFormState, AttendanceSummaryForPayroll } from '@/types/payroll'
import { DEFAULT_PAYROLL_FORM_STATE } from '@/types/payroll'

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
 * 근태 요약 데이터 조회 (API용)
 */
async function getAttendanceSummaryForMonth(
  supabase: ReturnType<typeof getServiceRoleClient>,
  employeeId: string,
  clinicId: string,
  year: number,
  month: number
): Promise<AttendanceSummaryForPayroll> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // 근태 기록 조회
  const { data: records, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', employeeId)
    .eq('clinic_id', clinicId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)

  // 소정 근로일수 (주말 제외, 간단 계산)
  const daysInMonth = new Date(year, month, 0).getDate()
  let totalWorkDays = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      totalWorkDays++
    }
  }

  if (error || !records || records.length === 0) {
    // 근태 기록이 없으면 기본값 반환
    return {
      userId: employeeId,
      year,
      month,
      totalWorkDays,
      presentDays: totalWorkDays,
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

  // 근태 통계 집계
  let presentDays = 0
  let leaveDays = 0
  let lateCount = 0
  let totalLateMinutes = 0
  let earlyLeaveCount = 0
  let totalEarlyLeaveMinutes = 0
  let overtimeMinutes = 0

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
    }

    overtimeMinutes += record.overtime_minutes || 0
  }

  const paidLeaveDays = Math.min(leaveDays, 15)
  const absentDays = Math.max(0, totalWorkDays - presentDays - paidLeaveDays)

  return {
    userId: employeeId,
    year,
    month,
    totalWorkDays,
    presentDays,
    absentDays,
    leaveDays,
    holidayDays: 0,
    lateCount,
    totalLateMinutes,
    earlyLeaveCount,
    totalEarlyLeaveMinutes,
    overtimeMinutes,
    nightWorkMinutes: 0,
    holidayWorkMinutes: 0,
    allowedAnnualLeave: 15,
    usedAnnualLeave: leaveDays,
    remainingAnnualLeave: Math.max(0, 15 - leaveDays)
  }
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

    // 과거 급여명세서에도 적용하는 경우 - 완전히 재계산
    let updatedStatementsCount = 0
    if (applyToPast) {
      console.log('[API] applyToPast is true, recalculating past statements for employee:', employeeId)
      console.log('[API] Attendance options:', { deductLateMinutes, deductEarlyLeaveMinutes, includeOvertimePay })

      // 해당 직원의 모든 급여명세서 조회 (연월 정보 포함)
      const { data: statements, error: fetchError } = await supabase
        .from('payroll_statements')
        .select('id, payment_year, payment_month, payments, deductions')
        .eq('clinic_id', clinicId)
        .eq('employee_user_id', employeeId)

      console.log('[API] Found statements:', statements?.length || 0)

      if (fetchError) {
        console.error('[API] Error fetching past statements:', fetchError)
      } else if (statements && statements.length > 0) {
        // 각 급여명세서 완전히 재계산
        for (const statement of statements) {
          try {
            const year = statement.payment_year
            const month = statement.payment_month

            console.log(`[API] Recalculating statement for ${year}-${month}`)

            // 1. 해당 월의 근태 데이터 조회
            const attendanceSummary = await getAttendanceSummaryForMonth(
              supabase,
              employeeId,
              clinicId,
              year,
              month
            )

            console.log(`[API] Attendance summary for ${year}-${month}:`, {
              presentDays: attendanceSummary.presentDays,
              absentDays: attendanceSummary.absentDays,
              lateCount: attendanceSummary.lateCount,
              totalLateMinutes: attendanceSummary.totalLateMinutes,
              earlyLeaveCount: attendanceSummary.earlyLeaveCount,
              totalEarlyLeaveMinutes: attendanceSummary.totalEarlyLeaveMinutes
            })

            // 2. 급여 기준 계산
            const basisAmount = salaryType === 'net' ? targetAmount : baseSalary
            const basis = calculatePayrollBasis(basisAmount || 0)

            // 3. 근태 차감 계산 (새로운 옵션 적용)
            const deductionOptions: AttendanceDeductionOptions = {
              deductLateMinutes: deductLateMinutes !== false,
              deductEarlyLeaveMinutes: deductEarlyLeaveMinutes !== false
            }
            const attendanceDeduction = calculateAttendanceDeduction(
              basis,
              attendanceSummary,
              attendanceSummary.allowedAnnualLeave,
              undefined,
              deductionOptions
            )

            console.log(`[API] Attendance deduction for ${year}-${month}:`, {
              totalDeduction: attendanceDeduction.totalDeduction,
              lateDeduction: attendanceDeduction.lateDeduction,
              earlyLeaveDeduction: attendanceDeduction.earlyLeaveDeduction,
              absentDeduction: attendanceDeduction.absentDeduction
            })

            // 4. 급여 재계산
            const attendanceDeductionAmount = attendanceDeduction.totalDeduction

            // 세후 계약: targetAmount에서 근태 차감, 세전 계약: 기타공제에 추가
            const adjustedTargetAmount = salaryType === 'net'
              ? Math.max(0, (targetAmount || 0) - attendanceDeductionAmount)
              : (targetAmount || 0)

            const adjustedOtherDeductions = salaryType === 'gross'
              ? (otherDeductions || 0) + attendanceDeductionAmount
              : (otherDeductions || 0)

            const newFormState: PayrollFormState = {
              ...DEFAULT_PAYROLL_FORM_STATE,
              selectedEmployeeId: employeeId,
              selectedYear: year,
              selectedMonth: month,
              salaryType: salaryType || 'net',
              targetAmount: adjustedTargetAmount,
              baseSalary: baseSalary || 0,
              mealAllowance: mealAllowance || 0,
              vehicleAllowance: vehicleAllowance || 0,
              bonus: bonus || 0,
              nationalPension: nationalPension || 0,
              healthInsurance: healthInsurance || 0,
              longTermCare: longTermCare || 0,
              employmentInsurance: employmentInsurance || 0,
              familyCount: familyCount || 1,
              childCount: childCount || 0,
              otherDeductions: adjustedOtherDeductions
            }

            const calculationResult = calculatePayrollFromFormState(newFormState)

            console.log(`[API] Recalculated payroll for ${year}-${month}:`, {
              totalPayment: calculationResult.totalPayment,
              totalDeduction: calculationResult.totalDeduction,
              netPay: calculationResult.netPay
            })

            // 5. 급여명세서 업데이트
            const { error: updateError } = await supabase
              .from('payroll_statements')
              .update({
                salary_type: salaryType,
                payments: calculationResult.payments,
                total_payment: calculationResult.totalPayment,
                deductions: calculationResult.deductions,
                total_deduction: calculationResult.totalDeduction,
                net_pay: calculationResult.netPay,
                non_taxable_total: calculationResult.nonTaxableTotal,
                updated_at: new Date().toISOString()
              })
              .eq('id', statement.id)

            if (updateError) {
              console.error(`[API] Error updating statement ${statement.id}:`, updateError)
            } else {
              console.log(`[API] Successfully recalculated statement ${statement.id} for ${year}-${month}`)
              updatedStatementsCount++
            }
          } catch (err) {
            console.error(`[API] Error recalculating statement ${statement.id}:`, err)
          }
        }
      }
      console.log('[API] Total recalculated statements:', updatedStatementsCount)
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
