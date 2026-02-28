/**
 * Telegram Webhook Setup API
 * POST /api/telegram/setup-webhook - Telegram 웹훅 URL 등록 (master_admin 전용)
 * GET /api/telegram/setup-webhook - 현재 웹훅 상태 확인 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function checkMasterAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'master_admin'
}

function getBotToken(bodyToken?: string): string | null {
  // 1순위: 서버 환경변수, 2순위: 요청 바디에서 전달
  return process.env.TELEGRAM_BOT_TOKEN || bodyToken || null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const botToken = getBotToken()
    if (!botToken) {
      return NextResponse.json(
        { data: null, error: 'TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    // Telegram getWebhookInfo API 호출
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
    const result = await res.json()

    if (!result.ok) {
      return NextResponse.json(
        { data: null, error: `Telegram API 오류: ${result.description}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      data: {
        url: result.result.url || null,
        has_custom_certificate: result.result.has_custom_certificate,
        pending_update_count: result.result.pending_update_count,
        last_error_date: result.result.last_error_date || null,
        last_error_message: result.result.last_error_message || null,
        max_connections: result.result.max_connections,
      },
      error: null,
    })
  } catch (error) {
    console.error('[GET /api/telegram/setup-webhook] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, botToken: bodyBotToken } = body

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const botToken = getBotToken(bodyBotToken)
    if (!botToken) {
      return NextResponse.json(
        { data: null, error: 'TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

    if (!supabaseUrl) {
      return NextResponse.json(
        { data: null, error: 'NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    if (!webhookSecret) {
      return NextResponse.json(
        { data: null, error: 'TELEGRAM_WEBHOOK_SECRET이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    // Supabase Edge Function URL + secret
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?secret=${webhookSecret}`

    // Telegram setWebhook API 호출
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`
    const telegramResponse = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message', 'channel_post'],
      }),
    })

    const telegramResult = await telegramResponse.json()

    if (!telegramResult.ok) {
      console.error('[POST /api/telegram/setup-webhook] Telegram API error:', telegramResult)
      return NextResponse.json(
        { data: null, error: `Telegram API 오류: ${telegramResult.description}` },
        { status: 400 }
      )
    }

    console.log('[POST /api/telegram/setup-webhook] Webhook registered:', webhookUrl)

    return NextResponse.json({
      data: {
        ok: true,
        webhookUrl,
        telegramResult,
      },
      error: null,
    })
  } catch (error) {
    console.error('[POST /api/telegram/setup-webhook] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
