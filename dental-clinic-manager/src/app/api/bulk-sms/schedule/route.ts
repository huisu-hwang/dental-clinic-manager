import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'
import {
  getEligiblePatients,
  applyVariables,
  normalizePhone,
} from '@/lib/bulkSmsService'
import type { BulkSmsFilter } from '@/types/bulkSms'

export const maxDuration = 60

interface ScheduleRequest {
  filter: BulkSmsFilter
  excludeRecallExcluded?: boolean
  message: string
  title?: string
  scheduledAt: string  // ISO 8601
  selectedPatientIds?: string[]
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_send')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = await request.json() as ScheduleRequest
  if (!body.message?.trim()) {
    return NextResponse.json({ success: false, error: '메시지가 비어 있습니다' }, { status: 400 })
  }
  const scheduled = new Date(body.scheduledAt)
  if (isNaN(scheduled.getTime())) {
    return NextResponse.json({ success: false, error: '예약 시각이 올바르지 않습니다' }, { status: 400 })
  }
  if (scheduled.getTime() < Date.now() + 60_000) {
    return NextResponse.json({ success: false, error: '예약 시각은 현재로부터 1분 이후여야 합니다' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
  if (maxBytes > 2000) {
    return NextResponse.json({ success: false, error: '메시지가 2000바이트를 초과합니다' }, { status: 400 })
  }
  const msgType = maxBytes > 90 ? 'LMS' : 'SMS'

  const { data: campaign, error: cErr } = await service
    .from('bulk_sms_campaigns')
    .insert({
      clinic_id: ctx.clinicId,
      created_by: ctx.userId,
      title: body.title ?? null,
      message: body.message,
      msg_type: msgType,
      total_count: patients.length,
      status: 'scheduled',
      scheduled_at: scheduled.toISOString(),
      filter_snapshot: body.filter,
      exclude_recall_excluded: body.excludeRecallExcluded !== false,
    })
    .select('id')
    .single()
  if (cErr || !campaign) {
    return NextResponse.json({ success: false, error: cErr?.message || '캠페인 생성 실패' }, { status: 500 })
  }

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
  for (let i = 0; i < rows.length; i += 1000) {
    const slice = rows.slice(i, i + 1000)
    const { error } = await service.from('bulk_sms_recipients').insert(slice)
    if (error) {
      await service.from('bulk_sms_campaigns').delete().eq('id', campaign.id)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    campaign_id: campaign.id,
    scheduled_at: scheduled.toISOString(),
    total: patients.length,
  })
}
