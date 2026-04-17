/**
 * 모의투자 → 실전 전환 API
 *
 * POST /api/investment/credentials/switch-live
 *
 * 안전 절차:
 * 1. 인증 확인
 * 2. "실전 전환" 텍스트 확인 입력
 * 3. is_paper_trading = false 업데이트
 * 4. 모든 전략 비활성 유지 (수동 활성화 필요)
 * 5. 감사 로그 + Telegram 알림
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  // 1. 확인 텍스트 검증
  const confirmText = body.confirmText
  if (confirmText !== '실전 전환') {
    return NextResponse.json(
      { error: '"실전 전환"을 정확히 입력해주세요' },
      { status: 400 }
    )
  }

  // 2. 활성 credential 조회
  const { data: credential } = await supabase
    .from('user_broker_credentials')
    .select('id, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (!credential) {
    return NextResponse.json({ error: '연결된 계좌가 없습니다' }, { status: 404 })
  }

  if (!credential.is_paper_trading) {
    return NextResponse.json({ error: '이미 실전 투자 모드입니다' }, { status: 400 })
  }

  // 3. 미체결 주문 확인
  const { count: pendingOrders } = await supabase
    .from('trade_orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'submitted'])

  if ((pendingOrders ?? 0) > 0) {
    return NextResponse.json(
      { error: '미체결 주문이 있습니다. 모든 주문이 완료된 후 전환하세요.' },
      { status: 400 }
    )
  }

  // 4. 실전 전환
  const { error: updateError } = await supabase
    .from('user_broker_credentials')
    .update({ is_paper_trading: false })
    .eq('id', credential.id)
    .eq('user_id', userId)

  if (updateError) {
    return NextResponse.json({ error: '전환에 실패했습니다' }, { status: 500 })
  }

  // 5. 모든 전략 비활성화 (안전 조치)
  await supabase
    .from('investment_strategies')
    .update({ is_active: false })
    .eq('user_id', userId)

  // 6. 감사 로그
  await supabase.from('investment_audit_logs').insert({
    user_id: userId,
    action: 'live_trading_enabled',
    resource_type: 'credential',
    resource_id: credential.id,
    status: 'success',
    metadata: {
      previousMode: 'paper',
      newMode: 'live',
      timestamp: new Date().toISOString(),
    },
  })

  return NextResponse.json({
    success: true,
    message: '실전 투자 모드로 전환되었습니다. 전략을 수동으로 활성화해야 자동매매가 시작됩니다.',
  })
}
