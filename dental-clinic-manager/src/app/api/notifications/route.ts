import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * 병원 알림 관리 API
 *
 * service_role을 사용하여 RLS를 우회합니다.
 * 서버 측에서 사용자 권한을 직접 검증합니다.
 */

// GET: 알림 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const activeOnly = searchParams.get('activeOnly') === 'true'

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

    let query = supabaseAdmin
      .from('clinic_notifications')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API notifications] Get error:', error)
      return NextResponse.json(
        { error: `Failed to get notifications: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })

  } catch (error) {
    console.error('[API notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: 새 알림 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, userId, notification } = body

    // 필수 파라미터 검증
    if (!clinicId || !userId || !notification) {
      return NextResponse.json(
        { error: 'Missing required parameters: clinicId, userId, notification' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      console.error('[API notifications] Supabase Admin client not available')
      return NextResponse.json(
        { error: 'Database connection not available' },
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
      console.error('[API notifications] User not found:', userError)
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

    // 4. 권한 확인 (owner만 알림 생성 가능)
    if (user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owner can create notifications' },
        { status: 403 }
      )
    }

    // 5. 알림 생성
    const { data, error: insertError } = await supabaseAdmin
      .from('clinic_notifications')
      .insert({
        clinic_id: clinicId,
        created_by: userId,
        title: notification.title,
        content: notification.content || null,
        category: notification.category,
        target_roles: notification.target_roles,
        recurrence_type: notification.recurrence_type,
        recurrence_config: notification.recurrence_config || null,
        start_date: notification.start_date,
        end_date: notification.end_date || null,
        is_active: notification.is_active,
        priority: notification.priority,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('[API notifications] Insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to create notification: ${insertError.message}` },
        { status: 500 }
      )
    }

    console.log('[API notifications] Successfully created notification for clinic:', clinicId)
    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT: 알림 수정
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, userId, notificationId, notification } = body

    // 필수 파라미터 검증
    if (!clinicId || !userId || !notificationId || !notification) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // 사용자 권한 검증
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId || user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 알림 수정
    const { data, error: updateError } = await supabaseAdmin
      .from('clinic_notifications')
      .update({
        title: notification.title,
        content: notification.content || null,
        category: notification.category,
        target_roles: notification.target_roles,
        recurrence_type: notification.recurrence_type,
        recurrence_config: notification.recurrence_config || null,
        start_date: notification.start_date,
        end_date: notification.end_date || null,
        is_active: notification.is_active,
        priority: notification.priority,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (updateError) {
      console.error('[API notifications] Update error:', updateError)
      return NextResponse.json(
        { error: `Failed to update notification: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: 알림 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const userId = searchParams.get('userId')
    const notificationId = searchParams.get('notificationId')

    if (!clinicId || !userId || !notificationId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // 사용자 권한 검증
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId || user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 알림 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('clinic_notifications')
      .delete()
      .eq('id', notificationId)
      .eq('clinic_id', clinicId)

    if (deleteError) {
      console.error('[API notifications] Delete error:', deleteError)
      return NextResponse.json(
        { error: `Failed to delete notification: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[API notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH: 알림 활성화/비활성화 토글 또는 알림 해제
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, userId, notificationId, isActive, action } = body

    // action이 'dismiss'인 경우 알림 해제 처리
    if (action === 'dismiss') {
      if (!clinicId || !userId || !notificationId) {
        return NextResponse.json(
          { error: 'Missing required parameters for dismiss' },
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

      // 사용자 권한 검증 (해제는 모든 활성 사용자가 가능)
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, clinic_id, status')
        .eq('id', userId)
        .single()

      if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }

      // 알림 해제 (오늘 날짜로 dismissed_at 설정)
      const today = new Date().toISOString().split('T')[0]
      const { data, error: updateError } = await supabaseAdmin
        .from('clinic_notifications')
        .update({
          dismissed_at: today,
          dismissed_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .eq('clinic_id', clinicId)
        .select()
        .single()

      if (updateError) {
        console.error('[API notifications] Dismiss error:', updateError)
        return NextResponse.json(
          { error: `Failed to dismiss notification: ${updateError.message}` },
          { status: 500 }
        )
      }

      console.log('[API notifications] Successfully dismissed notification:', notificationId)
      return NextResponse.json({ data, success: true })
    }

    // 기존 활성화/비활성화 토글 로직
    if (!clinicId || !userId || !notificationId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // 사용자 권한 검증
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, role, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.status !== 'active' || user.clinic_id !== clinicId || user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 활성화 상태 변경
    const { data, error: updateError } = await supabaseAdmin
      .from('clinic_notifications')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (updateError) {
      console.error('[API notifications] Toggle error:', updateError)
      return NextResponse.json(
        { error: `Failed to toggle notification: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
