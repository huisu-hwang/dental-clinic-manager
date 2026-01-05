/**
 * 근태 기록 조회 API
 * 급여 계산용 근태 데이터 조회
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Supabase 서버 클라이언트 생성 (서비스 롤 키 사용)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * GET /api/attendance/records
 * 근태 기록 조회
 *
 * Query Parameters:
 * - clinicId: 병원 ID (필수)
 * - userId: 직원 ID (필수)
 * - startDate: 시작 날짜 (YYYY-MM-DD) (필수)
 * - endDate: 종료 날짜 (YYYY-MM-DD) (필수)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const userId = searchParams.get('userId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // 필수 파라미터 검증
    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId is required' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      )
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 근태 기록 조회
    const { data, error } = await supabase
      .from('attendance_records')
      .select(`
        id,
        user_id,
        clinic_id,
        branch_id,
        work_date,
        check_in_time,
        check_out_time,
        scheduled_start,
        scheduled_end,
        late_minutes,
        early_leave_minutes,
        overtime_minutes,
        total_work_minutes,
        status,
        notes,
        is_manually_edited,
        created_at,
        updated_at
      `)
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })

    if (error) {
      console.error('[GET /api/attendance/records] Error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error) {
    console.error('[GET /api/attendance/records] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
