// 일일 작업 크론 (뉴스 크롤링)
// 텔레그램 요약은 다음날 KST 10시 발송 정책에 따라 /api/cron/telegram-summary 로 분리됨.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runNewsCrawl } from '@/lib/newsCrawlService'

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

  try {
    const news = await runNewsCrawl(supabase)
    return NextResponse.json({
      success: true,
      news: { success: true, results: news },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      news: { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
