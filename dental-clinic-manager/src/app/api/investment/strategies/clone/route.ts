/**
 * 공유 전략 클론 — 다른 사용자의 공유 전략을 내 계정으로 복사
 *
 * POST /api/investment/strategies/clone
 * Body: { strategyId: string }
 *
 * - 대상 전략은 is_shared=true 여야 함
 * - 자기 자신 전략은 클론 불필요 (400 반환)
 * - 클론 시 새 row 생성 (user_id=현재 사용자, name 끝에 "(공유 받음)" 추가)
 * - is_shared=false (클론본은 기본 비공개)
 * - 원본 전략의 clone_count +1
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

  let body: { strategyId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }
  const strategyId = typeof body.strategyId === 'string' ? body.strategyId : null
  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId 필수' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }

  // 원본 조회
  const { data: source, error: srcErr } = await supabase
    .from('investment_strategies')
    .select('*')
    .eq('id', strategyId)
    .eq('is_shared', true)
    .maybeSingle()

  if (srcErr || !source) {
    return NextResponse.json({ error: '공유된 전략을 찾을 수 없습니다' }, { status: 404 })
  }
  if (source.user_id === auth.user.id) {
    return NextResponse.json({ error: '본인 소유 전략은 클론할 필요가 없습니다' }, { status: 400 })
  }

  // 새 row 데이터 — id/created_at/updated_at 제외하고 모두 복사 + 일부 재설정
  const cloned = {
    user_id: auth.user.id,
    name: `${source.name} (공유 받음)`,
    description: source.description,
    target_market: source.target_market,
    timeframe: source.timeframe,
    indicators: source.indicators,
    buy_conditions: source.buy_conditions,
    sell_conditions: source.sell_conditions,
    risk_settings: source.risk_settings,
    automation_level: source.automation_level,
    credential_id: null,           // 자동매매 키는 매핑하지 않음
    is_active: false,              // 클론은 기본 비활성
    mode: source.mode,
    strategy_type: source.strategy_type,
    rl_model_id: null,             // RL 모델은 매핑하지 않음
    source_preset_id: null,        // 사용자 전략 클론은 source_preset_id 사용 안함 (별도 출처)
    is_shared: false,              // 클론본은 자동 공유 아님
    shared_at: null,
    share_alias: null,
    clone_count: 0,
  }

  const { data: inserted, error: insErr } = await supabase
    .from('investment_strategies')
    .insert(cloned)
    .select('id, name')
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // 원본의 clone_count +1 (실패해도 클론은 성공으로 응답)
  try {
    await supabase
      .from('investment_strategies')
      .update({ clone_count: (source.clone_count ?? 0) + 1 })
      .eq('id', source.id)
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, strategyId: inserted.id, name: inserted.name })
}
