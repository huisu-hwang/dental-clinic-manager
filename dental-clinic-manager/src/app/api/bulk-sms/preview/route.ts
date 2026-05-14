import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'
import { applyVariables, determineMsgType } from '@/lib/bulkSmsService'

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = await request.json() as { message: string; samplePatientName?: string }
  const personalized = applyVariables(body.message, {
    patientName: body.samplePatientName || '홍길동',
    clinicName: ctx.clinicName,
    clinicPhone: ctx.clinicPhone,
  })
  const msgType = determineMsgType(personalized)
  const bytes = new TextEncoder().encode(personalized).length

  return NextResponse.json({
    success: true,
    preview: personalized,
    msg_type: msgType,
    bytes,
  })
}
