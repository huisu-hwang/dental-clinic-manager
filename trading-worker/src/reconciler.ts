/**
 * 주문 재조정 (Reconciliation)
 *
 * 5분마다 submitted/partially_filled 상태 주문을 KIS API로 확인.
 * DB와 거래소 상태가 불일치하면 자동 동기화 + Telegram 알림.
 */

import cron from 'node-cron'
import { logger } from './logger'
import { getSupabase } from './supabaseClient'

let reconcileJob: cron.ScheduledTask | null = null

/**
 * 재조정 배치 시작
 */
export function startReconciler() {
  reconcileJob = cron.schedule('*/5 * * * *', async () => {
    await reconcile()
  })

  logger.info('주문 재조정 배치 시작 (5분 주기)')
}

/**
 * 재조정 배치 중지
 */
export function stopReconciler() {
  reconcileJob?.stop()
  logger.info('주문 재조정 배치 중지')
}

/**
 * 재조정 실행
 */
async function reconcile() {
  const supabase = getSupabase()

  // submitted 또는 partially_filled 상태 주문 조회
  const { data: orders } = await supabase
    .from('trade_orders')
    .select('id, user_id, ticker, market, kis_order_id, status, credential_id, created_at')
    .in('status', ['submitted', 'partially_filled'])

  if (!orders || orders.length === 0) {
    logger.debug('재조정 대상 주문 없음')
    return
  }

  logger.info({ count: orders.length }, '재조정 대상 주문 확인')

  for (const order of orders) {
    try {
      // 30분 이상 경과한 submitted 주문은 타임아웃 처리
      const createdAt = new Date(order.created_at).getTime()
      const elapsed = Date.now() - createdAt

      if (elapsed > 30 * 60 * 1000 && order.status === 'submitted') {
        logger.warn({ orderId: order.id, ticker: order.ticker }, '주문 타임아웃 (30분 초과)')

        await supabase
          .from('trade_orders')
          .update({
            status: 'failed',
            error_message: '주문 타임아웃 (30분 초과)',
          })
          .eq('id', order.id)

        // 감사 로그
        await supabase.from('investment_audit_logs').insert({
          user_id: order.user_id,
          action: 'trade_failed',
          resource_type: 'trade',
          resource_id: order.id,
          status: 'failure',
          error_message: 'Order timeout after 30 minutes',
          metadata: { ticker: order.ticker, market: order.market },
        })
      }

      // TODO: KIS API로 실제 주문 상태 조회 (Phase 4에서 구현)
      // const kisStatus = await queryKISOrderStatus(order.kis_order_id, order.credential_id)
      // if (kisStatus !== order.status) { ... 동기화 ... }
    } catch (err) {
      logger.error({ err, orderId: order.id }, '주문 재조정 오류')
    }
  }
}
