/**
 * GET /api/telegram/bot-info
 * 텔레그램 봇 username 조회 (딥 링크 생성용)
 */

import { NextResponse } from 'next/server'
import { getBotUsername } from '@/lib/telegramBotService'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { username, error } = await getBotUsername()

    if (error || !username) {
      return NextResponse.json(
        { data: null, error: error || '봇 정보를 가져올 수 없습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { username }, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/bot-info] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
