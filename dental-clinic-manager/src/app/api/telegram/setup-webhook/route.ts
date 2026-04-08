/**
 * Telegram Webhook Setup API
 * POST /api/telegram/setup-webhook - Telegram 웹훅 URL 등록 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    const isAdmin = await checkMasterAdmin(user.id)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { botToken } = body

    if (!botToken) {
      return NextResponse.json({ data: null, error: 'botToken은 필수입니다.' }, { status: 400 })
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

    // Supabase Edge Function URL (secret은 secret_token으로 전달)
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`

    // Telegram setWebhook API 호출
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`
    const telegramResponse = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'edited_message', 'channel_post', 'my_chat_member'],
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

    console.log('[POST /api/telegram/setup-webhook] Webhook registered successfully')

    return NextResponse.json({
      data: {
        ok: true,
        message: 'Webhook이 성공적으로 등록되었습니다.',
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
