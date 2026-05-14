import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: campaign, error: cErr } = await service
    .from('bulk_sms_campaigns')
    .select('*')
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (cErr || !campaign) return NextResponse.json({ success: false, error: '캠페인을 찾을 수 없습니다' }, { status: 404 })

  const { data: recipients } = await service
    .from('bulk_sms_recipients')
    .select('id, patient_name, phone_number, personalized_message, status, error_message, sent_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })
    .limit(2000)

  return NextResponse.json({ success: true, campaign, recipients: recipients ?? [] })
}
