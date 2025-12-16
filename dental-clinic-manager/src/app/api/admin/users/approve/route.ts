/**
 * Admin API Route: 사용자 승인 (마스터 전용)
 *
 * @description
 * 대기 중인 사용자를 승인하고 상태를 'active'로 변경합니다.
 * 승인 완료 시 이메일 알림을 발송합니다.
 *
 * SERVICE_ROLE_KEY를 사용하므로 서버에서만 실행됩니다.
 *
 * @returns {Object} 승인 처리 결과
 *
 * @example
 * const response = await fetch('/api/admin/users/approve', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ userId: 'uuid', clinicId: 'uuid', permissions: [] })
 * })
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(request: Request) {
  try {
    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendApiKey = process.env.RESEND_API_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Admin API - Approve User] Missing Supabase environment variables')
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      )
    }

    // 요청 바디에서 데이터 추출
    const { userId, clinicId, permissions } = await request.json()

    if (!userId || !clinicId) {
      return NextResponse.json(
        { success: false, error: 'userId and clinicId are required' },
        { status: 400 }
      )
    }

    // Admin 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('[Admin API - Approve User] Approving user:', userId)

    // 1. 사용자 정보 조회 (이메일 발송용)
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('email, name, clinics(name)')
      .eq('id', userId)
      .eq('clinic_id', clinicId)
      .single()

    if (fetchError || !userData) {
      console.error('[Admin API - Approve User] Error fetching user:', fetchError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // 2. 사용자 상태 업데이트
    const updateData: any = {
      status: 'active',
      approved_at: new Date().toISOString()
    }

    // 권한이 지정된 경우 저장
    if (permissions && permissions.length > 0) {
      updateData.permissions = permissions
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .eq('clinic_id', clinicId)

    if (error) {
      console.error('[Admin API - Approve User] Database error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    console.log('[Admin API - Approve User] User approved successfully')

    // 3. 승인 완료 이메일 발송 (선택 사항 - RESEND_API_KEY가 있을 때만)
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey)
        const clinicName = (userData.clinics as any)?.name || '클리닉 매니저'

        await resend.emails.send({
          from: 'ClinicManager <noreply@hi-clinic.co.kr>',
          to: [userData.email],
          subject: `[${clinicName}] 회원가입 승인 완료`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">회원가입 승인 완료</h2>
              <p>안녕하세요, <strong>${userData.name}</strong>님!</p>
              <p><strong>${clinicName}</strong>의 회원가입이 승인되었습니다.</p>
              <p>이제 클리닉 매니저의 모든 기능을 사용하실 수 있습니다.</p>
              <div style="margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hi-clinic.co.kr'}"
                   style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  로그인하러 가기
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #6b7280; font-size: 14px;">
                문의사항이 있으시면 병원 관리자에게 연락해 주세요.
              </p>
            </div>
          `
        })

        console.log('[Admin API - Approve User] Approval email sent to:', userData.email)
      } catch (emailError) {
        console.error('[Admin API - Approve User] Error sending email:', emailError)
        // 이메일 발송 실패해도 승인은 성공으로 처리
      }
    } else {
      console.log('[Admin API - Approve User] RESEND_API_KEY not configured, skipping email')
    }

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('[Admin API - Approve User] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
