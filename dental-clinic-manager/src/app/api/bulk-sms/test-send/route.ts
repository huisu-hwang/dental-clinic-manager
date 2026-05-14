import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'
import { applyVariables, determineMsgType, normalizePhone, sendBatch } from '@/lib/bulkSmsService'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_send')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = await request.json() as { message: string; phoneNumber: string; samplePatientName?: string; title?: string }
  const phone = normalizePhone(body.phoneNumber)
  if (phone.length < 9) {
    return NextResponse.json({ success: false, error: '전화번호 형식이 올바르지 않습니다' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: aligo } = await service
    .from('aligo_settings')
    .select('api_key, user_id, sender_number')
    .eq('clinic_id', ctx.clinicId)
    .single()

  if (!aligo?.api_key || !aligo.user_id || !aligo.sender_number) {
    return NextResponse.json({ success: false, error: '알리고 설정이 없습니다' }, { status: 400 })
  }

  const personalized = applyVariables(body.message, {
    patientName: body.samplePatientName || '테스트',
    clinicName: ctx.clinicName,
    clinicPhone: ctx.clinicPhone,
  })
  const result = await sendBatch({
    apiKey: aligo.api_key,
    userId: aligo.user_id,
    sender: aligo.sender_number,
    receivers: [phone],
    message: personalized,
    msgType: determineMsgType(personalized),
    title: body.title,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error || '발송 실패' }, { status: 500 })
  }
  return NextResponse.json({ success: true, msg_id: result.msg_id ?? null })
}
