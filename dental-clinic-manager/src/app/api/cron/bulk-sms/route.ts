// 예약 발송 처리 Cron
// Vercel Cron schedule: "*/5 * * * *" — 매 5분마다 실행
// scheduled_at <= NOW() 이고 status='scheduled'인 캠페인을 점유하여 발송한다
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCampaign } from '@/lib/bulkSmsService'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret.trim()}`) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 발송 시각 도래한 scheduled 캠페인 목록 조회
  const { data: candidates, error } = await supabase
    .from('bulk_sms_campaigns')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const summary = { processed: 0, success_count: 0, fail_count: 0, errors: [] as string[] }

  for (const c of candidates ?? []) {
    // 원자적 점유: scheduled → sending
    const { data: claimed } = await supabase
      .from('bulk_sms_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    summary.processed++
    try {
      const r = await sendCampaign(supabase, c.id)
      summary.success_count += r.success
      summary.fail_count += r.fail
    } catch (e) {
      summary.errors.push(`${c.id}: ${(e as Error).message}`)
      await supabase
        .from('bulk_sms_campaigns')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', c.id)
    }
  }

  return NextResponse.json({ success: true, ...summary })
}
