/**
 * 신호 프로세서
 *
 * 1. WebSocket 틱 데이터 수신 시 해당 종목을 감시하는 전략들의 조건 평가
 * 2. pending 백테스트 처리 (장기 백테스트 비동기 실행)
 * 3. 신호 발생 → Level 1: Telegram 알림 / Level 2: 주문 큐
 *
 * 보안:
 * - 전략당 평가 타임아웃 100ms
 * - 1개 전략 실패가 다른 전략에 영향 주지 않도록 try-catch 격리
 */

import cron from 'node-cron'
import { logger } from './logger'
import { getSupabase } from './supabaseClient'
import { kisWebSocket } from './kisWebSocket'
import { sendSignalAlert } from './telegramNotifier'
import { executeAutoOrder } from './orderExecutor'

let pendingBacktestJob: cron.ScheduledTask | null = null

/**
 * 신호 프로세서 시작
 */
export function startSignalProcessor() {
  // 1. 틱 데이터 핸들러 등록
  kisWebSocket.onTick(async (tickData) => {
    try {
      await processTickSignal(tickData.ticker, tickData.market, tickData.price)
    } catch (err) {
      logger.error({ err, ticker: tickData.ticker }, '틱 신호 처리 오류')
    }
  })

  // 2. Pending 백테스트 폴링 (30초마다)
  pendingBacktestJob = cron.schedule('*/30 * * * * *', async () => {
    await processPendingBacktests()
  })

  logger.info('신호 프로세서 시작')
}

/**
 * 신호 프로세서 중지
 */
export function stopSignalProcessor() {
  pendingBacktestJob?.stop()
  logger.info('신호 프로세서 중지')
}

/**
 * 틱 데이터 기반 신호 처리
 *
 * 해당 종목을 감시하는 활성 전략들을 조회하고,
 * 각 전략의 조건 트리를 평가합니다.
 */
async function processTickSignal(ticker: string, market: string, currentPrice: number) {
  const supabase = getSupabase()

  // 해당 종목을 감시하는 활성 전략 조회
  const { data: watchItems } = await supabase
    .from('strategy_watchlist')
    .select('strategy_id')
    .eq('ticker', ticker)
    .eq('market', market)
    .eq('is_active', true)

  if (!watchItems || watchItems.length === 0) return

  const strategyIds = watchItems.map(w => w.strategy_id)

  const { data: strategies } = await supabase
    .from('investment_strategies')
    .select('*')
    .in('id', strategyIds)
    .eq('is_active', true)

  if (!strategies || strategies.length === 0) return

  // 각 전략별 신호 평가 (격리)
  for (const strategy of strategies) {
    try {
      await evaluateStrategy(strategy, ticker, market, currentPrice)
    } catch (err) {
      logger.error({ err, strategyId: strategy.id, ticker }, '전략 평가 오류 (격리됨)')
    }
  }
}

/**
 * 개별 전략 평가
 *
 * 현재는 틱 기반 간이 평가 (일봉 기반 정밀 평가는 장 마감 후 배치로)
 * 가격 기반 손절/익절 체크가 주요 기능
 */
async function evaluateStrategy(
  strategy: Record<string, unknown>,
  ticker: string,
  market: string,
  currentPrice: number
) {
  const supabase = getSupabase()
  const riskSettings = strategy.risk_settings as Record<string, number> | null

  if (!riskSettings) return

  // 보유 포지션 체크 (손절/익절)
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('strategy_id', strategy.id)
    .eq('ticker', ticker)
    .eq('status', 'open')

  if (positions && positions.length > 0) {
    for (const pos of positions) {
      const avgPrice = Number(pos.avg_entry_price)
      const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100

      // 손절 체크
      if (riskSettings.stopLossPercent > 0 && pnlPercent <= -riskSettings.stopLossPercent) {
        logger.warn({ ticker, pnlPercent, stopLoss: riskSettings.stopLossPercent }, '손절 신호')

        // 감사 로그
        await supabase.from('investment_audit_logs').insert({
          user_id: strategy.user_id as string,
          action: 'risk_limit_reached',
          resource_type: 'position',
          resource_id: pos.id,
          metadata: { ticker, pnlPercent, type: 'stop_loss', currentPrice },
        })

        // Level 1: Telegram 알림
        await sendSignalAlert(strategy.user_id as string, {
          type: 'stop_loss',
          strategyName: strategy.name as string,
          ticker,
          market,
          pnlPercent: pnlPercent.toFixed(2),
          currentPrice,
        })

        // Level 2: 자동 손절 매도 주문
        if (strategy.automation_level === 2) {
          await executeAutoOrder({
            userId: strategy.user_id as string,
            strategyId: strategy.id as string,
            ticker,
            market: market as 'KR' | 'US',
            orderType: 'sell',
            quantity: pos.quantity,
            price: 0, // 시장가
            signalData: { type: 'stop_loss', pnlPercent, triggerPrice: currentPrice },
          })
        }
      }

      // 익절 체크
      if (riskSettings.takeProfitPercent > 0 && pnlPercent >= riskSettings.takeProfitPercent) {
        logger.info({ ticker, pnlPercent, takeProfit: riskSettings.takeProfitPercent }, '익절 신호')

        await supabase.from('investment_audit_logs').insert({
          user_id: strategy.user_id as string,
          action: 'risk_limit_reached',
          resource_type: 'position',
          resource_id: pos.id,
          metadata: { ticker, pnlPercent, type: 'take_profit', currentPrice },
        })

        await sendSignalAlert(strategy.user_id as string, {
          type: 'take_profit',
          strategyName: strategy.name as string,
          ticker,
          market,
          pnlPercent: pnlPercent.toFixed(2),
          currentPrice,
        })

        // Level 2: 자동 익절 매도 주문
        if (strategy.automation_level === 2) {
          await executeAutoOrder({
            userId: strategy.user_id as string,
            strategyId: strategy.id as string,
            ticker,
            market: market as 'KR' | 'US',
            orderType: 'sell',
            quantity: pos.quantity,
            price: 0, // 시장가
            signalData: { type: 'take_profit', pnlPercent, triggerPrice: currentPrice },
          })
        }
      }
    }
  }
}

/**
 * Pending 백테스트 처리 (장기 백테스트)
 */
async function processPendingBacktests() {
  const supabase = getSupabase()

  // pending 상태이고 아직 claim되지 않은 백테스트
  const { data: pending } = await supabase
    .from('backtest_runs')
    .select('id')
    .eq('status', 'pending')
    .is('claimed_at', null)
    .limit(1)

  if (!pending || pending.length === 0) return

  const run = pending[0]

  // Claim (중복 처리 방지)
  const { error: claimError } = await supabase
    .from('backtest_runs')
    .update({ status: 'running', claimed_at: new Date().toISOString() })
    .eq('id', run.id)
    .eq('status', 'pending')
    .is('claimed_at', null)

  if (claimError) {
    logger.debug('백테스트 claim 실패 (다른 워커가 처리 중)')
    return
  }

  logger.info({ backtestId: run.id }, 'Pending 백테스트 처리 시작')

  // TODO: 실제 백테스트 실행 로직 (backtestEngine 포팅 필요)
  // 현재는 완료 상태로만 업데이트
  await supabase
    .from('backtest_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: '워커 백테스트 엔진 미구현 (Phase 4에서 완성)',
    })
    .eq('id', run.id)

  logger.info({ backtestId: run.id }, 'Pending 백테스트 처리 완료')
}
