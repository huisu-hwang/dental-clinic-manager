/**
 * 긴급 정지 API
 *
 * POST /api/investment/emergency-stop
 *
 * 1. 모든 활성 전략 비활성화
 * 2. pending/submitted 주문 취소
 * 3. 감사 로그 기록
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST() {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // 1. 모든 활성 전략 비활성화
  const { data: strategies } = await supabase
    .from('investment_strategies')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .select('id')

  const deactivatedCount = strategies?.length || 0

  // 2. pending/submitted 주문 취소
  const { data: orders } = await supabase
    .from('trade_orders')
    .update({ status: 'cancelled', error_message: '긴급 정지' })
    .eq('user_id', userId)
    .in('status', ['pending', 'submitted'])
    .select('id')

  const cancelledCount = orders?.length || 0

  // 3. 보유 포지션에 대해 시장가 매도 주문 생성 (워커가 처리)
  const { data: openPositions } = await supabase
    .from('positions')
    .select('id, ticker, market, quantity, credential_id')
    .eq('user_id', userId)
    .eq('status', 'open')

  let liquidationOrders = 0
  if (openPositions && openPositions.length > 0) {
    for (const pos of openPositions) {
      if (pos.quantity <= 0) continue
      await supabase.from('trade_orders').insert({
        user_id: userId,
        credential_id: pos.credential_id,
        position_id: pos.id,
        ticker: pos.ticker,
        market: pos.market,
        order_type: 'sell',
        order_method: 'market',
        quantity: pos.quantity,
        status: 'pending',
        automation_level: null,
        signal_data: { type: 'emergency_liquidation' },
      })
      liquidationOrders++
    }
  }

  // 4. RL kill switch 강제 활성화
  await supabase
    .from('user_investment_settings')
    .upsert({
      user_id: userId,
      rl_paused_at: new Date().toISOString(),
      rl_paused_reason: 'emergency-stop',
    }, { onConflict: 'user_id' })

  // 5. 감사 로그
  await supabase.from('investment_audit_logs').insert({
    user_id: userId,
    action: 'emergency_stop',
    resource_type: 'system',
    status: 'success',
    metadata: {
      deactivatedStrategies: deactivatedCount,
      cancelledOrders: cancelledCount,
      liquidationOrders,
      timestamp: new Date().toISOString(),
    },
  })

  return NextResponse.json({
    success: true,
    deactivatedStrategies: deactivatedCount,
    cancelledOrders: cancelledCount,
    liquidationOrders,
  })
}
