/**
 * 급여 설정 API 라우트
 * GET: 급여 설정 목록 조회
 * POST: 급여 설정 저장 (생성/업데이트)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinic_id')
    const employeeUserId = searchParams.get('employee_user_id')

    if (!clinicId) {
      return NextResponse.json({ success: false, error: 'clinic_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('payroll_settings')
      .select(`
        *,
        employee:users!employee_user_id(id, name, email, phone, role)
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    if (employeeUserId) {
      query = query.eq('employee_user_id', employeeUserId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Get payroll settings error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Get payroll settings error:', error)
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
      clinic_id,
      employee_user_id,
      salary_type,
      base_salary,
      allowances,
      payment_day,
      national_pension,
      health_insurance,
      long_term_care,
      employment_insurance,
      income_tax_enabled,
      dependents_count,
      kakao_notification_enabled,
      kakao_phone_number,
      notes,
      current_user_id
    } = body

    if (!clinic_id || !employee_user_id) {
      return NextResponse.json(
        { success: false, error: 'clinic_id and employee_user_id are required' },
        { status: 400 }
      )
    }

    // 기존 설정 확인
    const { data: existing } = await supabase
      .from('payroll_settings')
      .select('id')
      .eq('clinic_id', clinic_id)
      .eq('employee_user_id', employee_user_id)
      .single()

    const settingData = {
      salary_type: salary_type || 'gross',
      base_salary: base_salary || 0,
      allowances: allowances || {},
      payment_day: payment_day || 25,
      national_pension: national_pension ?? true,
      health_insurance: health_insurance ?? true,
      long_term_care: long_term_care ?? true,
      employment_insurance: employment_insurance ?? true,
      income_tax_enabled: income_tax_enabled ?? true,
      dependents_count: dependents_count || 1,
      kakao_notification_enabled: kakao_notification_enabled ?? false,
      kakao_phone_number: kakao_phone_number || null,
      notes: notes || null
    }

    let data, error

    if (existing) {
      // 업데이트
      const result = await supabase
        .from('payroll_settings')
        .update({
          ...settingData,
          updated_by: current_user_id
        })
        .eq('id', existing.id)
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
        .from('payroll_settings')
        .insert({
          clinic_id,
          employee_user_id,
          ...settingData,
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
      console.error('Save payroll setting error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Save payroll setting error:', error)
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
    const settingId = searchParams.get('id')

    if (!settingId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('payroll_settings')
      .delete()
      .eq('id', settingId)

    if (error) {
      console.error('Delete payroll setting error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete payroll setting error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
