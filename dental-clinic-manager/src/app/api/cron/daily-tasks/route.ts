// 일일 작업 통합 크론 (뉴스 크롤링 + 텔레그램 요약)
// Vercel Hobby 플랜 크론 2개 제한으로 인해 news + telegram-summary 통합
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

  // 뉴스 + 텔레그램 요약을 병렬 실행
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
