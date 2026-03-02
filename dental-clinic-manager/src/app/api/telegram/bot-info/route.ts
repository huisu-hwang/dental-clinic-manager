/**
 * GET /api/telegram/bot-info
 * 텔레그램 봇 username 조회 (딥 링크 생성용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBotUsername } from '@/lib/telegramBotService'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || new URL(request.url).searchParams.get('userId')
    if (!userId) {
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
