import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const ALIGO_API_URL = 'https://apis.aligo.in'

interface ThanksSmsBody {
  clinic_id: string
  referral_id?: string
  recipient_dentweb_patient_id: string
  phone_number: string
  message: string
  msg_type?: 'SMS' | 'LMS' | 'MMS'
  title?: string
  sent_by?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ThanksSmsBody
    const { clinic_id, referral_id, recipient_dentweb_patient_id, phone_number, message, msg_type = 'SMS', title, sent_by } = body

    if (!clinic_id || !recipient_dentweb_patient_id || !phone_number || !message) {
      return NextResponse.json({ success: false, error: '필수 파라미터가 누락되었습니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 })
    }

    const { data: aligo, error: settingsError } = await supabase
      .from('aligo_settings')
      .select('*')
      .eq('clinic_id', clinic_id)
      .single()

    if (settingsError || !aligo || !aligo.api_key || !aligo.user_id || !aligo.sender_number) {
      return NextResponse.json({ success: false, error: '알리고 API 설정이 없거나 미완료입니다.' }, { status: 400 })
    }

    const msgBytes = new Blob([message]).size
    if (msgBytes > 2000) {
      return NextResponse.json({ success: false, error: '메시지 길이가 2000바이트를 초과합니다.' }, { status: 400 })
    }
    const actualType = msgBytes > 90 && msg_type === 'SMS' ? 'LMS' : msg_type

    const formData = new FormData()
    formData.append('key', aligo.api_key)
    formData.append('user_id', aligo.user_id)
    formData.append('sender', aligo.sender_number)
    formData.append('receiver', phone_number)
    formData.append('msg', message)
    formData.append('msg_type', actualType)
    if (title && actualType !== 'SMS') {
      const titleBytes = new Blob([title]).size
      if (titleBytes > 44) {
        return NextResponse.json({ success: false, error: '문자 제목은 44바이트 이하여야 합니다.' }, { status: 400 })
      }
      formData.append('title', title)
    }
    if (process.env.NODE_ENV === 'development') formData.append('testmode_yn', 'Y')

    const aligoRes = await fetch(`${ALIGO_API_URL}/send/`, { method: 'POST', body: formData })
    const aligoJson = (await aligoRes.json()) as { result_code: string | number; message: string; msg_id?: string | number }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[referral sms]', JSON.stringify(aligoJson), 'type:', actualType, 'bytes:', msgBytes)
    }

    // Aligo 스펙: result_code 는 Integer, >= 1 이면 성공, < 0 이면 실패. 문자열 응답에도 안전하도록 Number 변환.
    const codeNum = Number(aligoJson.result_code)
    const ok = Number.isFinite(codeNum) && codeNum >= 1

    await supabase.from('referral_sms_logs').insert({
      clinic_id,
      referral_id: referral_id ?? null,
      recipient_dentweb_patient_id,
      phone_number,
      message_content: message,
      message_type: actualType,
      status: ok ? 'sent' : 'failed',
      aligo_msg_id: aligoJson.msg_id ?? null,
      error_message: ok ? null : aligoJson.message,
      sent_by: sent_by ?? null,
    })

    if (ok && referral_id) {
      await supabase
        .from('patient_referrals')
        .update({ thanks_sms_sent_at: new Date().toISOString() })
        .eq('id', referral_id)
    }

    if (ok) {
      return NextResponse.json({ success: true, msg_id: aligoJson.msg_id })
    }

    // 알리고 원본 메시지를 그대로 노출 — 발신번호 LMS 미등록·잔액 부족 등 실제 원인 확인용
    const aligoMsg = aligoJson.message || '문자 발송에 실패했습니다.'
    const lower = aligoMsg.toLowerCase()
    // 스펙: -101 은 인증오류(IP 미등록 포함). 메시지 문자열 휴리스틱과 함께 사용.
    const isIpError =
      codeNum === -101 ||
      lower.includes('인증오류') ||
      lower.includes('인증되지') ||
      lower.includes('등록되지 않은 ip') ||
      lower.includes('등록된 ip') ||
      lower.includes('-ip') ||
      /(?:^|[^a-z])ip(?:[^a-z]|$)/.test(lower)

    let hint: string | null = null
    if (isIpError) {
      let serverIp: string | null = null
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
        if (ipRes.ok) {
          const ipJson = (await ipRes.json()) as { ip?: string }
          serverIp = ipJson.ip ?? null
        }
      } catch {
        /* IP 조회 실패는 무시 — 안내 본문만 표시 */
      }
      // 알리고 IP 보안 정책의 정확한 메뉴 명칭/위치는 공식 문서에 명시되지 않아 고객센터 문의로 안내.
      // 본 서비스는 Vercel 서버리스로 동작해 호출마다 발송 IP가 달라질 수 있다는 사실은 고지.
      const ipLine = serverIp ? `\n(참고: 이번 호출 시 발송 서버 IP = ${serverIp} — 호출마다 달라질 수 있음)` : ''
      hint =
        '알리고 측에서 발송 IP 인증을 검증한 것으로 보입니다. 알리고 고객센터(1661-1565 또는 smartsms.aligo.in 문의하기)에 IP 인증 해제 또는 IP 등록 절차를 문의해주세요.\n' +
        '※ 본 서비스는 Vercel 서버리스로 동작해 호출마다 발송 IP가 달라질 수 있어, 특정 IP만 등록하는 방식은 안정적이지 않습니다.' +
        ipLine
    } else if (lower.includes('발신번호') || lower.includes('sender')) {
      hint = `발신번호(${aligo.sender_number})가 알리고에 사전 등록되지 않았거나 LMS/MMS용으로 등록되지 않았습니다.`
    } else if (lower.includes('잔액') || lower.includes('충전') || lower.includes('포인트')) {
      hint = '알리고 잔액(포인트)이 부족합니다.'
    }

    return NextResponse.json({
      success: false,
      error: aligoMsg,
      hint,
      aligoCode: aligoJson.result_code,
    })
  } catch (e) {
    console.error('[referral sms] error:', e)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
