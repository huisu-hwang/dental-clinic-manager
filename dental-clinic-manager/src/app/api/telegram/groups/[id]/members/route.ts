/**
 * Telegram Group Members API
 * GET    /api/telegram/groups/[id]/members - 멤버 목록 조회 (master_admin 전용)
 * POST   /api/telegram/groups/[id]/members - 멤버 추가 (master_admin 전용)
 * DELETE /api/telegram/groups/[id]/members - 멤버 제거 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function checkMasterAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'master_admin'
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const userId = request.headers.get('x-user-id') || new URL(request.url).searchParams.get('userId')

    // 권한 확인: master_admin, 그룹 생성자, 또는 그룹 멤버
    const isAdmin = await checkMasterAdmin(userId)
    let isGroupCreator = false
    let isGroupMember = false
    if (!isAdmin && userId) {
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('created_by')
        .eq('id', groupId)
        .maybeSingle()
      isGroupCreator = group?.created_by === userId

      if (!isGroupCreator) {
        const { data: membership } = await supabase
          .from('telegram_group_members')
          .select('id')
          .eq('telegram_group_id', groupId)
          .eq('user_id', userId)
          .maybeSingle()
        isGroupMember = !!membership
      }
    }

    if (!isAdmin && !isGroupCreator && !isGroupMember) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('telegram_group_members')
      .select(`
        *,
        user:users(name, email)
      `)
      .eq('telegram_group_id', groupId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/telegram/groups/[id]/members] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/groups/[id]/members] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, targetUserId, joinedVia } = body

    if (!userId) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    // 권한 확인: master_admin 또는 그룹 생성자
    const isAdmin = await checkMasterAdmin(userId)
    let isGroupCreator = false
    if (!isAdmin) {
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('created_by')
        .eq('id', groupId)
        .maybeSingle()
      isGroupCreator = group?.created_by === userId
    }

    if (!isAdmin && !isGroupCreator) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    if (!targetUserId) {
      return NextResponse.json({ data: null, error: 'targetUserId는 필수입니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('telegram_group_members')
      .insert({
        telegram_group_id: groupId,
        user_id: targetUserId,
        joined_via: joinedVia || 'admin',
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/telegram/groups/[id]/members] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/members] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    const requestUserId = request.headers.get('x-user-id') || searchParams.get('requestUserId')

    const body = await request.json().catch(() => ({}))
    const adminUserId = body.userId || requestUserId

    // 권한 확인: master_admin 또는 그룹 생성자
    const isAdmin = await checkMasterAdmin(adminUserId)
    let isGroupCreator = false
    if (!isAdmin && adminUserId) {
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('created_by')
        .eq('id', groupId)
        .maybeSingle()
      isGroupCreator = group?.created_by === adminUserId
    }

    if (!isAdmin && !isGroupCreator) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    if (!targetUserId) {
      return NextResponse.json({ data: null, error: 'userId 쿼리 파라미터가 필요합니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('telegram_group_members')
      .delete()
      .eq('telegram_group_id', groupId)
      .eq('user_id', targetUserId)

    if (error) {
      console.error('[DELETE /api/telegram/groups/[id]/members] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (error) {
    console.error('[DELETE /api/telegram/groups/[id]/members] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
