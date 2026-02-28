/**
 * Telegram Groups API
 * GET  /api/telegram/groups - 모든 텔레그램 그룹 목록 조회 (master_admin 전용)
 * POST /api/telegram/groups - 새 그룹 생성 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// master_admin 권한 확인 헬퍼
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

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    // 요청 바디 또는 헤더에서 userId 추출
    const userId = request.headers.get('x-user-id') || new URL(request.url).searchParams.get('userId')

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('telegram_groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/telegram/groups] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/groups] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, ...dto } = body

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { telegram_chat_id, chat_title, board_slug, board_title } = dto
    if (!telegram_chat_id || !chat_title || !board_slug || !board_title) {
      return NextResponse.json(
        { data: null, error: 'telegram_chat_id, chat_title, board_slug, board_title은 필수입니다.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('telegram_groups')
      .insert({
        ...dto,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/telegram/groups] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/telegram/groups] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
