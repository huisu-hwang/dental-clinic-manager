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
    const actualType = msgBytes > 90 && msg_type === 'SMS' ? 'LMS' : msg_type

    const formData = new FormData()
    formData.append('key', aligo.api_key)
    formData.append('user_id', aligo.user_id)
    formData.append('sender', aligo.sender_number)
    formData.append('receiver', phone_number)
    formData.append('msg', message)
    formData.append('msg_type', actualType)
    if (title && actualType !== 'SMS') formData.append('title', title)
    if (process.env.NODE_ENV === 'development') formData.append('testmode_yn', 'Y')

    const aligoRes = await fetch(`${ALIGO_API_URL}/send/`, { method: 'POST', body: formData })
    const aligoJson = (await aligoRes.json()) as { result_code: string; message: string; msg_id?: string }

    const ok = aligoJson.result_code === '1'

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

    let errorMessage = aligoJson.message || '문자 발송에 실패했습니다.'
    if (errorMessage.includes('ip') || errorMessage.includes('IP') || errorMessage.includes('인증오류')) {
      errorMessage = 'IP 인증 오류: 알리고 관리자 페이지(smartsms.aligo.in)에서 서버 IP를 등록해주세요.'
    }
    return NextResponse.json({ success: false, error: errorMessage })
  } catch (e) {
    console.error('[referral sms] error:', e)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
