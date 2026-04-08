/**
 * Telegram Group Invite Links API
 * GET  /api/telegram/groups/[id]/invite-links - 초대 링크 목록 조회 (master_admin 전용)
 * POST /api/telegram/groups/[id]/invite-links - 초대 링크 생성 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// 랜덤 12자리 alphanumeric 코드 생성
function generateInviteCode(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

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

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }
    const userId = user.id

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('telegram_invite_links')
      .select('*')
      .eq('telegram_group_id', groupId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/telegram/groups/[id]/invite-links] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/groups/[id]/invite-links] Error:', error)
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
    const { expires_at, max_uses } = body

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }
    const userId = user.id

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const inviteCode = generateInviteCode(12)

    const { data, error } = await supabase
      .from('telegram_invite_links')
      .insert({
        telegram_group_id: groupId,
        invite_code: inviteCode,
        created_by: userId,
        expires_at: expires_at ?? null,
        max_uses: max_uses ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/telegram/groups/[id]/invite-links] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/invite-links] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
