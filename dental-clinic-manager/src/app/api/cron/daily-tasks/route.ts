// 일일 작업 크론 — KST 10시에 뉴스 크롤링 + 텔레그램 일일요약을 함께 실행.
// (Vercel Hobby 플랜의 cron 갯수 한도 때문에 별도 cron 항목을 만들 수 없어
//  요약 호출을 같은 라우트에 묶고, 스케줄을 KST 10시로 옮겨 "다음날 오전 10시 발송"
//  요구사항을 충족.)
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runNewsCrawl } from '@/lib/newsCrawlService'
import { runTelegramSummary } from '@/lib/telegramSummaryCron'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret.trim()}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: 'Supabase configuration missing' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 뉴스 + 텔레그램 요약을 병렬 실행 (개별 실패가 다른 작업을 막지 않도록 allSettled)
  const [newsResult, summaryResult] = await Promise.allSettled([
    runNewsCrawl(supabase),
    runTelegramSummary(supabase),
  ])

  return NextResponse.json({
    success: true,
    news: newsResult.status === 'fulfilled'
      ? { success: true, results: newsResult.value }
      : { success: false, error: newsResult.reason?.message ?? 'Unknown error' },
    telegramSummary: summaryResult.status === 'fulfilled'
      ? { success: true, results: summaryResult.value }
      : { success: false, error: summaryResult.reason?.message ?? 'Unknown error' },
    timestamp: new Date().toISOString(),
  })
}
