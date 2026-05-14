import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'
import {
  getEligiblePatients,
  applyVariables,
  normalizePhone,
  sendCampaign,
} from '@/lib/bulkSmsService'
import type { BulkSmsFilter } from '@/types/bulkSms'

export const maxDuration = 60

interface SendRequest {
  filter: BulkSmsFilter
  excludeRecallExcluded?: boolean
  message: string
  title?: string
  // 사용자가 결과 리스트에서 일부 환자만 선택했을 경우, 그 dentweb_patient_id 화이트리스트
  selectedPatientIds?: string[]
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_send')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = await request.json() as SendRequest
  if (!body.message?.trim()) {
    return NextResponse.json({ success: false, error: '메시지가 비어 있습니다' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) 대상 환자 다시 조회 (클라가 보낸 명단을 신뢰하지 않음)
  const eligible = await getEligiblePatients(
    service,
    ctx.clinicId,
    body.filter,
    body.excludeRecallExcluded !== false
  )
  let patients = eligible.patients
  if (body.selectedPatientIds && body.selectedPatientIds.length > 0) {
    const allowed = new Set(body.selectedPatientIds)
    patients = patients.filter(p => allowed.has(p.dentweb_patient_id))
  }
  if (patients.length === 0) {
    return NextResponse.json({ success: false, error: '발송 대상이 없습니다' }, { status: 400 })
  }

  // 2) 가장 긴 치환 결과 기준으로 통일된 msg_type 결정
  let maxBytes = 0
  for (const p of patients) {
    const m = applyVariables(body.message, {
      patientName: p.patient_name,
      clinicName: ctx.clinicName,
      clinicPhone: ctx.clinicPhone,
    })
    const b = new TextEncoder().encode(m).length
    if (b > maxBytes) maxBytes = b
  }
  const msgType = maxBytes > 90 ? 'LMS' : 'SMS'
  if (maxBytes > 2000) {
    return NextResponse.json({ success: false, error: '메시지가 2000바이트를 초과합니다' }, { status: 400 })
  }

  // 3) 캠페인 생성 (status='sending')
  const { data: campaign, error: cErr } = await service
    .from('bulk_sms_campaigns')
    .insert({
      clinic_id: ctx.clinicId,
      created_by: ctx.userId,
      title: body.title ?? null,
      message: body.message,
      msg_type: msgType,
      total_count: patients.length,
      status: 'sending',
      filter_snapshot: body.filter,
      exclude_recall_excluded: body.excludeRecallExcluded !== false,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (cErr || !campaign) {
    return NextResponse.json({ success: false, error: cErr?.message || '캠페인 생성 실패' }, { status: 500 })
  }

  // 4) 수신자 행 일괄 INSERT
  const rows = patients.map(p => ({
    campaign_id: campaign.id,
    clinic_id: ctx.clinicId,
    dentweb_patient_id: p.dentweb_patient_id,
    patient_name: p.patient_name,
    phone_number: normalizePhone(p.phone_number),
    personalized_message: applyVariables(body.message, {
      patientName: p.patient_name,
      clinicName: ctx.clinicName,
      clinicPhone: ctx.clinicPhone,
    }),
    status: 'pending' as const,
  }))
  // 1,000행 단위 분할 insert
  for (let i = 0; i < rows.length; i += 1000) {
    const slice = rows.slice(i, i + 1000)
    const { error } = await service.from('bulk_sms_recipients').insert(slice)
    if (error) {
      await service.from('bulk_sms_campaigns')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', campaign.id)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  }

  // 5) 실제 발송
  try {
    const r = await sendCampaign(service, campaign.id)
    return NextResponse.json({
      success: true,
      campaign_id: campaign.id,
      total: patients.length,
      success_count: r.success,
      fail_count: r.fail,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      campaign_id: campaign.id,
      error: (e as Error).message,
    }, { status: 500 })
  }
}
