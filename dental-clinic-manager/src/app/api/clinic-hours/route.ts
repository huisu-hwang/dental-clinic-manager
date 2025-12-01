import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

interface ClinicHoursInput {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
  break_start: string
  break_end: string
}

/**
 * 병원 진료시간 업데이트 API
 *
 * service_role을 사용하여 RLS를 우회합니다.
 * 서버 측에서 사용자 권한을 직접 검증합니다.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, hoursData, userId } = body as {
      clinicId: string
      hoursData: ClinicHoursInput[]
      userId: string
    }

    // 필수 파라미터 검증
    if (!clinicId || !hoursData || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: clinicId, hoursData, userId' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      console.error('[API clinic-hours] Supabase Admin client not available')
      return NextResponse.json(
        { error: 'Database connection not available. Please check SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      )
    }

    // 1. 사용자 권한 검증
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.error('[API clinic-hours] User not found:', userError)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 403 }
      )
    }

    // 2. 사용자 상태 확인
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'User account is not active' },
        { status: 403 }
      )
    }

    // 3. 소속 병원 확인
    if (user.clinic_id !== clinicId) {
      return NextResponse.json(
        { error: 'User does not belong to this clinic' },
        { status: 403 }
      )
    }

    // 4. 권한 확인 (owner, vice_director, manager만 허용)
    const allowedRoles = ['owner', 'vice_director', 'manager']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // 5. 기존 데이터 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('clinic_hours')
      .delete()
      .eq('clinic_id', clinicId)

    if (deleteError) {
      console.error('[API clinic-hours] Delete error:', deleteError)
      return NextResponse.json(
        { error: `Failed to delete existing hours: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // 6. 새 데이터 삽입
    const insertData = hoursData.map(hours => ({
      clinic_id: clinicId,
      day_of_week: hours.day_of_week,
      is_open: hours.is_open,
      open_time: hours.is_open && hours.open_time ? hours.open_time : null,
      close_time: hours.is_open && hours.close_time ? hours.close_time : null,
      break_start: hours.is_open && hours.break_start ? hours.break_start : null,
      break_end: hours.is_open && hours.break_end ? hours.break_end : null,
    }))

    const { data, error: insertError } = await supabaseAdmin
      .from('clinic_hours')
      .insert(insertData)
      .select()

    if (insertError) {
      console.error('[API clinic-hours] Insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to insert hours: ${insertError.message}` },
        { status: 500 }
      )
    }

    console.log('[API clinic-hours] Successfully updated clinic hours for clinic:', clinicId)
    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API clinic-hours] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * 병원 진료시간 조회 API
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Missing required parameter: clinicId' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('clinic_hours')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('day_of_week')

    if (error) {
      console.error('[API clinic-hours] Get error:', error)
      return NextResponse.json(
        { error: `Failed to get hours: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })

  } catch (error) {
    console.error('[API clinic-hours] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
