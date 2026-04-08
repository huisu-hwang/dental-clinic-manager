/**
 * Telegram Join via Invite Code API
 * GET  /api/telegram/join/[code] - 초대 코드 유효성 확인 및 그룹 정보 반환 (비인증도 허용)
 * POST /api/telegram/join/[code] - 초대 코드로 그룹 참가 (인증된 사용자)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code: inviteCode } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    // userId는 선택적 — 비로그인도 그룹 정보 조회 가능
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    const userId = user?.id ?? null

    // 초대 링크 조회 (그룹 정보 포함)
    const { data: link, error: linkError } = await supabase
      .from('telegram_invite_links')
      .select('*, telegram_groups(*)')
      .eq('invite_code', inviteCode)
      .eq('is_active', true)
      .maybeSingle()

    if (linkError) {
      console.error('[GET /api/telegram/join/[code]] DB error:', linkError)
      return NextResponse.json({ data: null, error: linkError.message }, { status: 500 })
    }

    if (!link) {
      return NextResponse.json({ data: null, error: '유효하지 않은 초대 코드입니다.' }, { status: 404 })
    }

    // 만료 확인
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ data: null, error: '만료된 초대 링크입니다.' }, { status: 410 })
    }

    // 최대 사용 횟수 확인
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return NextResponse.json({ data: null, error: '초대 링크 사용 횟수가 초과되었습니다.' }, { status: 410 })
    }

    const group = link.telegram_groups as any

    // userId가 있으면 멤버 확인, 없으면 requiresAuth 반환
    if (userId) {
      const { data: existing } = await supabase
        .from('telegram_group_members')
        .select('id')
        .eq('telegram_group_id', link.telegram_group_id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: '이미 그룹 멤버입니다.', alreadyMember: true, boardSlug: group?.board_slug },
          { status: 409 }
        )
      }
    }

    // 그룹 정보 반환 (비인증 시 requiresAuth: true 추가)
    return NextResponse.json({
      board_title: group?.board_title ?? null,
      board_description: group?.board_description ?? null,
      board_slug: group?.board_slug ?? null,
      requiresAuth: !userId,
    })
  } catch (error) {
    console.error('[GET /api/telegram/join/[code]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code: inviteCode } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // body가 없는 경우 무시
    }

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }
    const userId = user.id

    // 초대 링크 유효성 검사
    const { data: link, error: linkError } = await supabase
      .from('telegram_invite_links')
      .select('*, telegram_groups(*)')
      .eq('invite_code', inviteCode)
      .eq('is_active', true)
      .maybeSingle()

    if (linkError) {
      console.error('[POST /api/telegram/join/[code]] Link error:', linkError)
      return NextResponse.json({ data: null, error: linkError.message }, { status: 500 })
    }

    if (!link) {
      return NextResponse.json({ data: null, error: '유효하지 않은 초대 코드입니다.' }, { status: 404 })
    }

    // 만료 확인
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ data: null, error: '만료된 초대 링크입니다.' }, { status: 410 })
    }

    // 최대 사용 횟수 확인
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return NextResponse.json({ data: null, error: '초대 링크 사용 횟수가 초과되었습니다.' }, { status: 410 })
    }

    const groupId = link.telegram_group_id
    const group = link.telegram_groups as any

    // 이미 멤버인지 확인
    const { data: existing, error: existingError } = await supabase
      .from('telegram_group_members')
      .select('id')
      .eq('telegram_group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError) {
      console.error('[POST /api/telegram/join/[code]] Existing check error:', existingError)
      return NextResponse.json({ data: null, error: existingError.message }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json(
        { data: null, error: '이미 그룹 멤버입니다.' },
        { status: 409 }
      )
    }

    // 멤버 추가
    const { error: memberError } = await supabase
      .from('telegram_group_members')
      .insert({
        telegram_group_id: groupId,
        user_id: userId,
        joined_via: 'invite_link',
      })

    if (memberError) {
      console.error('[POST /api/telegram/join/[code]] Member insert error:', memberError)
      return NextResponse.json({ data: null, error: memberError.message }, { status: 500 })
    }

    // use_count 증가
    const { error: countError } = await supabase
      .from('telegram_invite_links')
      .update({ use_count: link.use_count + 1 })
      .eq('id', link.id)

    if (countError) {
      console.error('[POST /api/telegram/join/[code]] use_count update error:', countError)
      // 멤버 추가는 성공했으므로 카운트 오류는 로그만 남기고 계속
    }

    return NextResponse.json({
      boardSlug: group?.board_slug ?? null,
      boardTitle: group?.board_title ?? null,
    })
  } catch (error) {
    console.error('[POST /api/telegram/join/[code]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
