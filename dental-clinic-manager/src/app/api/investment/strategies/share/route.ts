/**
 * 전략 공유 토글
 *
 * POST /api/investment/strategies/share
 * Body: { strategyId: string; shared: boolean; alias?: string | null }
 *
 * - 자신이 소유한 전략만 토글 가능
 * - shared=true 시 shared_at=now(), shared=false 시 shared_at=null
 * - alias 비어있으면 users.name 자동 사용
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  let body: { strategyId?: string; shared?: boolean; alias?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const strategyId = typeof body.strategyId === 'string' ? body.strategyId : null
  const shared = Boolean(body.shared)
  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId 필수' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }

  // 소유권 확인
  const { data: existing, error: existErr } = await supabase
    .from('investment_strategies')
    .select('id, user_id, name')
    .eq('id', strategyId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (existErr || !existing) {
    return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
  }

  const update: Record<string, unknown> = {
    is_shared: shared,
    shared_at: shared ? new Date().toISOString() : null,
  }
  if (typeof body.alias === 'string') {
    update.share_alias = body.alias.trim() || null
  } else if (body.alias === null) {
    update.share_alias = null
  }

  const { error: updErr } = await supabase
    .from('investment_strategies')
    .update(update)
    .eq('id', strategyId)
    .eq('user_id', auth.user.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, isShared: shared })
}
