/**
 * 회원가입 승인 요청 알림 API
 *
 * 새로운 회원이 가입 신청하면 해당 병원의 마스터(대표원장) 계정에
 * 이메일, SMS, 인앱 알림을 발송합니다.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const ROLE_LABELS: Record<string, string> = {
  owner: '대표원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '진료팀장',
  staff: '일반직원',
}

export async function POST(request: Request) {
  try {
    const { clinicId, applicantName, applicantEmail, applicantPhone, applicantRole } = await request.json()

    if (!clinicId || !applicantName || !applicantEmail || !applicantRole) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // 1. 해당 병원의 대표원장(owner) 조회
    const { data: owners, error: ownerError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone')
      .eq('clinic_id', clinicId)
      .eq('role', 'owner')
      .eq('status', 'active')

    if (ownerError || !owners || owners.length === 0) {
      console.error('[Signup Notification] Owner not found for clinic:', clinicId, ownerError)
      return NextResponse.json(
        { success: false, error: '해당 병원의 대표원장을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 2. 병원 정보 조회
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('name')
      .eq('id', clinicId)
      .single()

    const clinicName = clinic?.name || '클리닉'
    const roleLabel = ROLE_LABELS[applicantRole] || applicantRole
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hi-clinic.co.kr'

    const results = {
      email: { sent: false, error: null as string | null },
      sms: { sent: false, error: null as string | null },
      inApp: { sent: false, error: null as string | null },
    }

    // 3. 각 owner에게 알림 발송
    for (const owner of owners) {
      // 3-1. 이메일 알림 (Resend)
      const resendApiKey = process.env.RESEND_API_KEY
      if (resendApiKey && owner.email) {
        try {
          const { Resend } = await import('resend')
          const resend = new Resend(resendApiKey)

          await resend.emails.send({
            from: 'ClinicManager <noreply@hi-clinic.co.kr>',
            to: [owner.email],
            subject: `[${clinicName}] 새로운 회원가입 승인 요청`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">새로운 회원가입 승인 요청</h2>
                <p>안녕하세요, <strong>${owner.name}</strong>님!</p>
                <p><strong>${clinicName}</strong>에 새로운 가입 신청이 접수되었습니다.</p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #64748b; width: 80px;">이름</td>
                      <td style="padding: 8px 0; font-weight: bold;">${applicantName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #64748b;">이메일</td>
                      <td style="padding: 8px 0;">${applicantEmail}</td>
                    </tr>
                    ${applicantPhone ? `
                    <tr>
                      <td style="padding: 8px 0; color: #64748b;">연락처</td>
                      <td style="padding: 8px 0;">${applicantPhone}</td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding: 8px 0; color: #64748b;">직책</td>
                      <td style="padding: 8px 0;">${roleLabel}</td>
                    </tr>
                  </table>
                </div>
                <div style="margin: 30px 0;">
                  <a href="${appUrl}/master"
                     style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    승인 관리 페이지로 이동
                  </a>
                </div>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px;">
                  마스터 관리 페이지에서 가입 요청을 승인하거나 거절할 수 있습니다.
                </p>
              </div>
            `
          })

          results.email.sent = true
          console.log('[Signup Notification] Email sent to owner:', owner.email)
        } catch (emailError) {
          results.email.error = emailError instanceof Error ? emailError.message : 'Email send failed'
          console.error('[Signup Notification] Email error:', emailError)
        }
      }

      // 3-2. SMS 알림 (Aligo)
      if (owner.phone) {
        try {
          const { data: aligoSettings } = await supabaseAdmin
            .from('aligo_settings')
            .select('*')
            .eq('clinic_id', clinicId)
            .single()

          if (aligoSettings?.api_key && aligoSettings?.user_id && aligoSettings?.sender_number) {
            const smsMessage = `[${clinicName}] 새로운 가입 승인 요청\n이름: ${applicantName}\n직책: ${roleLabel}\n클리닉 매니저에서 승인해주세요.`

            const formData = new FormData()
            formData.append('key', aligoSettings.api_key)
            formData.append('user_id', aligoSettings.user_id)
            formData.append('sender', aligoSettings.sender_number)
            formData.append('receiver', owner.phone.replace(/-/g, ''))
            formData.append('msg', smsMessage)
            // 메시지 길이에 따라 SMS/LMS 자동 결정
            const msgLength = new Blob([smsMessage]).size
            formData.append('msg_type', msgLength > 90 ? 'LMS' : 'SMS')
            if (msgLength > 90) {
              formData.append('title', `[${clinicName}] 가입 승인 요청`)
            }
            if (process.env.NODE_ENV === 'development') {
              formData.append('testmode_yn', 'Y')
            }

            const aligoResponse = await fetch('https://apis.aligo.in/send/', {
              method: 'POST',
              body: formData,
            })
            const aligoResult = await aligoResponse.json()

            if (aligoResult.result_code === '1') {
              results.sms.sent = true
              console.log('[Signup Notification] SMS sent to owner:', owner.phone)
            } else {
              results.sms.error = aligoResult.message || 'SMS send failed'
              console.error('[Signup Notification] SMS error:', aligoResult)
            }
          } else {
            results.sms.error = '알리고 설정이 완료되지 않았습니다.'
          }
        } catch (smsError) {
          results.sms.error = smsError instanceof Error ? smsError.message : 'SMS send failed'
          console.error('[Signup Notification] SMS error:', smsError)
        }
      }

      // 3-3. 인앱 알림
      try {
        await supabaseAdmin
          .from('user_notifications')
          .insert({
            clinic_id: clinicId,
            user_id: owner.id,
            type: 'signup_approval_pending',
            title: `새로운 가입 승인 요청: ${applicantName}`,
            content: `${applicantName}님이 ${roleLabel} 직책으로 가입을 신청했습니다.`,
            link: '/master',
            created_at: new Date().toISOString(),
          })

        results.inApp.sent = true
        console.log('[Signup Notification] In-app notification created for owner:', owner.id)
      } catch (inAppError) {
        results.inApp.error = inAppError instanceof Error ? inAppError.message : 'In-app notification failed'
        console.error('[Signup Notification] In-app notification error:', inAppError)
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })

  } catch (error) {
    console.error('[Signup Notification] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
