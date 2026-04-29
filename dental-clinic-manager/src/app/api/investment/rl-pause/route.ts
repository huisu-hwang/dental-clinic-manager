/**
 * RL 일시정지(Kill Switch) API
 *
 * POST /api/investment/rl-pause - RL 전략 일시정지 / 재개
 * GET  /api/investment/rl-pause - 현재 일시정지 상태 조회
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  let body: { paused: boolean; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { paused, reason } = body
  if (typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'paused 필드(boolean)가 필요합니다' }, { status: 400 })
  }

  const update = paused
    ? { rl_paused_at: new Date().toISOString(), rl_paused_reason: reason ?? 'user manual' }
    : { rl_paused_at: null, rl_paused_reason: null }

  const { error } = await supabase
    .from('user_investment_settings')
    .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' })

  if (error) {
    console.error('RL 일시정지 상태 저장 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, paused })
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data } = await supabase
    .from('user_investment_settings')
    .select('rl_paused_at, rl_paused_reason')
    .eq('user_id', userId)
    .maybeSingle()

  return NextResponse.json({
    paused: Boolean(data?.rl_paused_at),
    rl_paused_at: data?.rl_paused_at ?? null,
    rl_paused_reason: data?.rl_paused_reason ?? null,
  })
}
