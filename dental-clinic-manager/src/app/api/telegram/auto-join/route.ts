/**
 * Telegram Auto-Join API
 * POST /api/telegram/auto-join
 * 로그인 시 pending 이메일 초대를 자동 처리하여 소모임에 가입
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ data: null, error: 'userId is required' }, { status: 400 })
    }

    // 1. 사용자 이메일 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    if (userError || !user?.email) {
      return NextResponse.json({ data: { joinedCount: 0 }, error: null })
    }

    // 2. pending 이메일 초대 조회
    const { data: pendingInvites, error: inviteError } = await supabase
      .from('telegram_email_invites')
      .select('id, telegram_group_id, invite_code')
      .eq('email', user.email.toLowerCase())
      .eq('status', 'pending')

    if (inviteError || !pendingInvites || pendingInvites.length === 0) {
      return NextResponse.json({ data: { joinedCount: 0 }, error: null })
    }

    let joinedCount = 0

    // 3. 각 초대에 대해 자동 가입 처리
    for (const invite of pendingInvites) {
      try {
        // 이미 멤버인지 확인
        const { data: existingMember } = await supabase
          .from('telegram_group_members')
          .select('id')
          .eq('telegram_group_id', invite.telegram_group_id)
          .eq('user_id', userId)
          .maybeSingle()

        if (existingMember) {
          // 이미 멤버면 초대 상태만 업데이트
          await supabase
            .from('telegram_email_invites')
            .update({ status: 'joined', joined_at: new Date().toISOString() })
            .eq('id', invite.id)
          continue
        }

        // 멤버 추가
        const { error: memberError } = await supabase
          .from('telegram_group_members')
          .insert({
            telegram_group_id: invite.telegram_group_id,
            user_id: userId,
            joined_via: 'invite_link',
          })

        if (memberError) {
          console.error('[auto-join] Failed to add member:', memberError)
          continue
        }

        // 초대 상태 업데이트
        await supabase
          .from('telegram_email_invites')
          .update({ status: 'joined', joined_at: new Date().toISOString() })
          .eq('id', invite.id)

        // 초대 링크 use_count 증가
        const { data: link } = await supabase
          .from('telegram_invite_links')
          .select('id, use_count')
          .eq('invite_code', invite.invite_code)
          .eq('is_active', true)
          .maybeSingle()

        if (link) {
          await supabase
            .from('telegram_invite_links')
            .update({ use_count: link.use_count + 1 })
            .eq('id', link.id)
        }

        joinedCount++
      } catch (err) {
        console.error('[auto-join] Error processing invite:', invite.id, err)
      }
    }

    console.log(`[auto-join] User ${userId} auto-joined ${joinedCount} groups`)

    return NextResponse.json({ data: { joinedCount }, error: null })
  } catch (error) {
    console.error('[auto-join] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
