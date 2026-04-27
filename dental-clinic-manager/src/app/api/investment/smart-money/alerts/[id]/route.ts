/**
 * Smart Money Alert 단건 (수정/삭제)
 *
 * PATCH  /api/investment/smart-money/alerts/[id]
 *   Request: { enabled?, signal_types?, min_confidence?, notification_methods? }
 *   Response: { data: SmartMoneyAlert }
 *
 * DELETE /api/investment/smart-money/alerts/[id]
 *   Response: { ok: true }
 *
 * - admin client 사용 → 명시적으로 user_id=auth.user.id 조건 추가
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type {
  SignalType,
  NotificationMethod,
  SmartMoneyAlert,
} from '@/types/smartMoney'

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
// PATCH
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }
  const userId = auth.user.id
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled는 boolean이어야 합니다.' }, { status: 400 })
    }
    updates.enabled = body.enabled
  }

  if ('signal_types' in body) {
    const signalTypes = validateSignalTypes(body.signal_types)
    if (signalTypes === null) {
      return NextResponse.json(
        { error: 'signal_types에 알 수 없는 값이 포함되어 있거나 비어있습니다.' },
        { status: 400 }
      )
    }
    updates.signal_types = signalTypes
  }

  if ('min_confidence' in body) {
    const minConfidence = validateConfidence(body.min_confidence)
    if (minConfidence === null) {
      return NextResponse.json(
        { error: 'min_confidence는 0 이상 100 이하여야 합니다.' },
        { status: 400 }
      )
    }
    updates.min_confidence = minConfidence
  }

  if ('notification_methods' in body) {
    const methods = validateNotificationMethods(body.notification_methods)
    if (methods === null) {
      return NextResponse.json(
        { error: 'notification_methods는 inapp/telegram/push 중에서 선택해야 합니다.' },
        { status: 400 }
      )
    }
    updates.notification_methods = methods
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('smart_money_alerts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[smart-money/alerts PATCH] 수정 실패:', error.message)
    return NextResponse.json({ error: '알림 수정 실패' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '알림을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ data: data as unknown as SmartMoneyAlert })
}

// ============================================
// DELETE
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }
  const userId = auth.user.id
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { error, count } = await supabase
    .from('smart_money_alerts')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[smart-money/alerts DELETE] 삭제 실패:', error.message)
    return NextResponse.json({ error: '알림 삭제 실패' }, { status: 500 })
  }

  if (count === 0) {
    return NextResponse.json({ error: '알림을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
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
