/**
 * Telegram Email Invite API
 * POST /api/telegram/email-invite
 * 비회원에게 소모임 초대 이메일 발송
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { userId, groupId, email } = await request.json()

    if (!userId || !groupId || !email) {
      return NextResponse.json({ data: null, error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    // 이메일 형식 검증
    const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ data: null, error: '유효하지 않은 이메일 형식입니다.' }, { status: 400 })
    }

    // 1. 권한 확인 (master_admin 또는 그룹 생성자)
    const { data: requester } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    const { data: group } = await supabase
      .from('telegram_groups')
      .select('id, created_by, board_title, board_slug')
      .eq('id', groupId)
      .single()

    if (!group) {
      return NextResponse.json({ data: null, error: '소모임을 찾을 수 없습니다.' }, { status: 404 })
    }

    const isMasterAdmin = requester?.role === 'master_admin'
    const isCreator = group.created_by === userId

    // 그룹 멤버인지도 확인 (멤버면 초대 가능)
    const { data: memberCheck } = await supabase
      .from('telegram_group_members')
      .select('id')
      .eq('telegram_group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!isMasterAdmin && !isCreator && !memberCheck) {
      return NextResponse.json({ data: null, error: '초대 권한이 없습니다.' }, { status: 403 })
    }

    // 2. 이미 가입된 사용자인지 확인
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingUser) {
      // 이미 회원 → 이미 그룹 멤버인지 확인
      const { data: existingMember } = await supabase
        .from('telegram_group_members')
        .select('id')
        .eq('telegram_group_id', groupId)
        .eq('user_id', existingUser.id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ data: null, error: '이미 소모임 멤버인 회원입니다.' }, { status: 409 })
      }

      return NextResponse.json({ data: null, error: '이미 가입된 회원입니다. 사용자 검색으로 초대해주세요.' }, { status: 409 })
    }

    // 3. Resend API 키 확인 (DB 작업 전에 체크)
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('[email-invite] RESEND_API_KEY not configured')
      return NextResponse.json({ data: null, error: '이메일 발송 설정이 되어있지 않습니다.' }, { status: 500 })
    }

    // 4. 이미 pending 초대가 있는지 확인
    const { data: existingInvite } = await supabase
      .from('telegram_email_invites')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('telegram_group_id', groupId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvite) {
      return NextResponse.json({ data: null, error: '이미 초대 이메일을 발송했습니다.' }, { status: 409 })
    }

    // 5. 그룹의 활성 초대 링크 조회 → 없으면 새로 생성
    let inviteLink: any = null
    const { data: activeLink } = await supabase
      .from('telegram_invite_links')
      .select('*')
      .eq('telegram_group_id', groupId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeLink) {
      inviteLink = activeLink
    } else {
      // 새 초대 링크 생성
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let inviteCode = ''
      for (let i = 0; i < 12; i++) {
        inviteCode += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      const { data: newLink, error: linkError } = await supabase
        .from('telegram_invite_links')
        .insert({
          telegram_group_id: groupId,
          invite_code: inviteCode,
          created_by: userId,
        })
        .select()
        .single()

      if (linkError) {
        console.error('[email-invite] Failed to create invite link:', linkError)
        return NextResponse.json({ data: null, error: '초대 링크 생성에 실패했습니다.' }, { status: 500 })
      }

      inviteLink = newLink
    }

    // 5. telegram_email_invites에 insert
    const { error: insertError } = await supabase
      .from('telegram_email_invites')
      .insert({
        email: email.toLowerCase(),
        telegram_group_id: groupId,
        invite_code: inviteLink.invite_code,
        invited_by: userId,
      })

    if (insertError) {
      console.error('[email-invite] Failed to insert email invite:', insertError)
      return NextResponse.json({ data: null, error: '초대 기록 저장에 실패했습니다.' }, { status: 500 })
    }

    // 7. Resend로 이메일 발송
    const resend = new Resend(resendApiKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hi-clinic.co.kr'
    const joinUrl = `${appUrl}/community/telegram/join/${inviteLink.invite_code}?autoJoin=1`

    await resend.emails.send({
      from: 'ClinicManager <noreply@hi-clinic.co.kr>',
      to: [email],
      subject: `[${group.board_title}] 소모임 초대`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0ea5e9; margin-bottom: 8px;">소모임 초대</h2>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
            <strong>${group.board_title}</strong> 소모임에 초대되었습니다.
          </p>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 32px;">
            아래 버튼을 클릭하여 회원가입 후 소모임에 참여하세요.
          </p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${joinUrl}"
               style="background-color: #0ea5e9; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: 600;">
              소모임 가입하기
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #9ca3af; font-size: 12px;">
            이 이메일은 클리닉 매니저에서 발송되었습니다.
            본인이 요청하지 않은 초대라면 이 이메일을 무시해주세요.
          </p>
        </div>
      `,
    })

    console.log(`[email-invite] Invite email sent to ${email} for group ${group.board_title}`)

    // 7. 성공 반환 (초대 링크 정보 포함)
    return NextResponse.json({
      data: {
        email,
        inviteLink: {
          id: inviteLink.id,
          invite_code: inviteLink.invite_code,
          is_active: inviteLink.is_active,
          telegram_group_id: inviteLink.telegram_group_id,
          use_count: inviteLink.use_count,
          max_uses: inviteLink.max_uses,
          created_at: inviteLink.created_at,
          expires_at: inviteLink.expires_at,
          created_by: inviteLink.created_by,
        },
      },
      error: null,
    })
  } catch (error) {
    console.error('[email-invite] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
