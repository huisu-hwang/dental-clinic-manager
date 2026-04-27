/**
 * Smart Money Alerts (목록/생성)
 *
 * GET  /api/investment/smart-money/alerts
 *   Response: { data: SmartMoneyAlert[] }
 *
 * POST /api/investment/smart-money/alerts
 *   Request: { ticker, market, ticker_name, signal_types[], min_confidence, notification_methods[] }
 *   Response: { data: SmartMoneyAlert }
 *   - 동일 (user_id, ticker, market) 활성 알림 있으면 update로 처리
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type {
  SignalType,
  NotificationMethod,
  SmartMoneyAlert,
} from '@/types/smartMoney'
import type { Market } from '@/types/investment'

export const dynamic = 'force-dynamic'

const VALID_SIGNAL_TYPES: SignalType[] = [
  'spring',
  'upthrust',
  'absorption',
  'twap-distribution',
  'twap-accumulation',
  'vwap-distribution',
  'vwap-accumulation',
  'iceberg-buy',
  'iceberg-sell',
  'sniper-buy',
  'sniper-sell',
  'foreigner-accumulation',
  'foreigner-distribution',
  'institution-accumulation',
  'institution-distribution',
]

const VALID_NOTIFICATION_METHODS: NotificationMethod[] = ['inapp', 'telegram', 'push']

// ============================================
// GET: 알림 목록 (본인)
// ============================================

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('smart_money_alerts')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[smart-money/alerts GET] 조회 실패:', error.message)
    return NextResponse.json({ error: '알림 목록 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ data: (data ?? []) as unknown as SmartMoneyAlert[] })
}

// ============================================
// POST: 알림 생성 (또는 동일 ticker+market 활성 알림 갱신)
// ============================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }
  const userId = auth.user.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  // 검증
  const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : ''
  const market = body.market === 'KR' || body.market === 'US' ? (body.market as Market) : null
  const tickerName =
    typeof body.ticker_name === 'string' && body.ticker_name.trim().length > 0
      ? body.ticker_name.trim()
      : null
  const signalTypes = validateSignalTypes(body.signal_types)
  const minConfidence = validateConfidence(body.min_confidence)
  const notificationMethods = validateNotificationMethods(body.notification_methods)

  if (!ticker) {
    return NextResponse.json({ error: 'ticker는 필수입니다.' }, { status: 400 })
  }
  if (!market) {
    return NextResponse.json({ error: 'market은 KR 또는 US여야 합니다.' }, { status: 400 })
  }
  if (signalTypes === null) {
    return NextResponse.json(
      { error: 'signal_types에 알 수 없는 값이 포함되어 있거나 비어있습니다.' },
      { status: 400 }
    )
  }
  if (minConfidence === null) {
    return NextResponse.json(
      { error: 'min_confidence는 0 이상 100 이하여야 합니다.' },
      { status: 400 }
    )
  }
  if (notificationMethods === null) {
    return NextResponse.json(
      { error: 'notification_methods는 inapp/telegram/push 중에서 선택해야 합니다.' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // 동일 ticker+market에 이미 활성 알림 있는지 확인
  const { data: existing } = await supabase
    .from('smart_money_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .eq('market', market)
    .eq('enabled', true)
    .maybeSingle()

  if (existing) {
    const existingId = (existing as { id: string }).id
    const { data: updated, error: updateErr } = await supabase
      .from('smart_money_alerts')
      .update({
        ticker_name: tickerName,
        signal_types: signalTypes,
        min_confidence: minConfidence,
        notification_methods: notificationMethods,
        enabled: true,
      })
      .eq('id', existingId)
      .eq('user_id', userId)
      .select('*')
      .single()

    if (updateErr || !updated) {
      console.error('[smart-money/alerts POST] 갱신 실패:', updateErr?.message)
      return NextResponse.json({ error: '알림 갱신 실패' }, { status: 500 })
    }

    return NextResponse.json({ data: updated as unknown as SmartMoneyAlert })
  }

  // 신규 생성
  const { data: created, error: insertErr } = await supabase
    .from('smart_money_alerts')
    .insert({
      user_id: userId,
      ticker,
      market,
      ticker_name: tickerName,
      signal_types: signalTypes,
      min_confidence: minConfidence,
      notification_methods: notificationMethods,
      enabled: true,
    })
    .select('*')
    .single()

  if (insertErr || !created) {
    console.error('[smart-money/alerts POST] 생성 실패:', insertErr?.message)
    return NextResponse.json({ error: '알림 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ data: created as unknown as SmartMoneyAlert })
}

// ============================================
// 입력 검증 헬퍼
// ============================================

function validateSignalTypes(input: unknown): SignalType[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const result: SignalType[] = []
  for (const v of input) {
    if (typeof v !== 'string') return null
    if (!VALID_SIGNAL_TYPES.includes(v as SignalType)) return null
    if (!result.includes(v as SignalType)) result.push(v as SignalType)
  }
  return result
}

function validateConfidence(input: unknown): number | null {
  const n = Number(input)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

function validateNotificationMethods(input: unknown): NotificationMethod[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const result: NotificationMethod[] = []
  for (const v of input) {
    if (typeof v !== 'string') return null
    if (!VALID_NOTIFICATION_METHODS.includes(v as NotificationMethod)) return null
    if (!result.includes(v as NotificationMethod)) result.push(v as NotificationMethod)
  }
  return result
}
