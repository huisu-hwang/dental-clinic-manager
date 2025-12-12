import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * 사용자별 알림 관리 API
 *
 * service_role을 사용하여 RLS를 우회합니다.
 * 서버 측에서 사용자 권한을 직접 검증합니다.
 */

// GET: 내 알림 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const clinicId = searchParams.get('clinicId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    if (!userId || !clinicId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, clinicId' },
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

    // 사용자 확인
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.clinic_id !== clinicId || user.status !== 'active') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 알림 목록 조회
    let query = supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[API user-notifications] Get error:', error)
      return NextResponse.json(
        { error: `Failed to get notifications: ${error.message}` },
        { status: 500 }
      )
    }

    // 읽지 않은 알림 개수 조회
    const { count: unreadCount } = await supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .or('expires_at.is.null,expires_at.gt.now()')

    return NextResponse.json({
      data: {
        notifications: data || [],
        unreadCount: unreadCount || 0,
        total: count || 0,
      }
    })

  } catch (error) {
    console.error('[API user-notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: 알림 생성 (서버 내부용)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, createdBy, notifications } = body

    // notifications는 단일 객체 또는 배열
    if (!clinicId || !notifications) {
      return NextResponse.json(
        { error: 'Missing required parameters: clinicId, notifications' },
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

    // createdBy 사용자 권한 검증 (같은 병원 소속인지)
    if (createdBy) {
      const { data: creator, error: creatorError } = await supabaseAdmin
        .from('users')
        .select('id, clinic_id, status')
        .eq('id', createdBy)
        .single()

      if (creatorError || !creator || creator.clinic_id !== clinicId || creator.status !== 'active') {
        return NextResponse.json(
          { error: 'Creator is not authorized' },
          { status: 403 }
        )
      }
    }

    // 알림 데이터 준비
    const notificationArray = Array.isArray(notifications) ? notifications : [notifications]
    const insertData = notificationArray.map(n => ({
      clinic_id: clinicId,
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      content: n.content || null,
      link: n.link || null,
      reference_type: n.reference_type || null,
      reference_id: n.reference_id || null,
      created_by: createdBy || null,
      expires_at: n.expires_at || null,
      created_at: new Date().toISOString(),
    }))

    // 알림 생성
    const { data, error: insertError } = await supabaseAdmin
      .from('user_notifications')
      .insert(insertData)
      .select()

    if (insertError) {
      console.error('[API user-notifications] Insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to create notification: ${insertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API user-notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH: 알림 읽음 처리
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, clinicId, notificationId, markAll } = body

    if (!userId || !clinicId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, clinicId' },
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

    // 사용자 확인
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.clinic_id !== clinicId || user.status !== 'active') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 모두 읽음 처리
    if (markAll) {
      const { data, error: updateError } = await supabaseAdmin
        .from('user_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select()

      if (updateError) {
        console.error('[API user-notifications] Mark all read error:', updateError)
        return NextResponse.json(
          { error: `Failed to mark all as read: ${updateError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, count: data?.length || 0 })
    }

    // 단일 알림 읽음 처리
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Missing notificationId or markAll parameter' },
        { status: 400 }
      )
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('user_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('[API user-notifications] Mark read error:', updateError)
      return NextResponse.json(
        { error: `Failed to mark as read: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, success: true })

  } catch (error) {
    console.error('[API user-notifications] Unexpected error:', error)
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
    const userId = searchParams.get('userId')
    const clinicId = searchParams.get('clinicId')
    const notificationId = searchParams.get('notificationId')

    if (!userId || !clinicId || !notificationId) {
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

    // 사용자 확인
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, clinic_id, status')
      .eq('id', userId)
      .single()

    if (userError || !user || user.clinic_id !== clinicId || user.status !== 'active') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // 알림 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('user_notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[API user-notifications] Delete error:', deleteError)
      return NextResponse.json(
        { error: `Failed to delete notification: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[API user-notifications] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
