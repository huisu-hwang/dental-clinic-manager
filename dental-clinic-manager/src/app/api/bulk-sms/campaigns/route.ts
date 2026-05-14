import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export async function GET(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let q = service
    .from('bulk_sms_campaigns')
    .select('id, title, message, msg_type, total_count, success_count, fail_count, status, scheduled_at, sent_at, completed_at, created_at, created_by', { count: 'exact' })
    .eq('clinic_id', ctx.clinicId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status) q = q.eq('status', status)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, campaigns: data ?? [], total: count ?? 0 })
}
