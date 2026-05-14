import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_send')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await service
    .from('bulk_sms_campaigns')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ success: false, error: '취소할 수 없는 캠페인입니다 (이미 발송됨 또는 존재하지 않음)' }, { status: 400 })

  return NextResponse.json({ success: true })
}
