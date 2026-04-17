/**
 * 트레이딩 워커 진입점
 *
 * PM2로 관리되는 프로세스.
 * 1. 환경변수 검증
 * 2. Supabase 연결 테스트
 * 3. 워커 등록 (heartbeat)
 * 4. 시장 스케줄러 시작
 * 5. 신호 프로세서 시작
 *
 * Graceful Shutdown:
 * - SIGINT/SIGTERM 수신 시 WebSocket 해제 → 진행 중 작업 완료 대기 → 종료
 */

import { logger } from './logger'
import { loadConfig } from './config'
import { getSupabase } from './supabaseClient'
import { startMarketScheduler, stopMarketScheduler } from './marketScheduler'
import { startSignalProcessor, stopSignalProcessor } from './signalProcessor'
import { startReconciler, stopReconciler } from './reconciler'

let isShuttingDown = false

async function main() {
  logger.info('=== 트레이딩 워커 시작 ===')

  // 1. 환경변수 검증
  try {
    const config = loadConfig()
    logger.info({ env: config.nodeEnv }, '환경변수 검증 완료')
  } catch (err) {
    logger.fatal({ err }, '환경변수 검증 실패')
    process.exit(1)
  }

  // 2. Supabase 연결 테스트
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('investment_strategies').select('id', { count: 'exact', head: true })
    if (error) throw error
    logger.info('Supabase 연결 성공')
  } catch (err) {
    logger.fatal({ err }, 'Supabase 연결 실패')
    process.exit(1)
  }

  // 3. 워커 등록
  await registerWorker()

  // 4. 시장 스케줄러 시작 (장 시간에 맞춰 WebSocket 연결/해제)
  startMarketScheduler()

  // 5. 신호 프로세서 시작 (pending 백테스트 처리 포함)
  startSignalProcessor()

  // 6. 주문 재조정 배치 시작 (5분 주기)
  startReconciler()

  logger.info('=== 트레이딩 워커 준비 완료 ===')

  // 헬스 체크 (60초마다)
  setInterval(async () => {
    if (isShuttingDown) return
    try {
      const supabase = getSupabase()
      await supabase.from('investment_strategies').select('id', { count: 'exact', head: true })
      logger.debug('헬스 체크 OK')
    } catch (err) {
      logger.error({ err }, '헬스 체크 실패')
    }
  }, 60_000)
}

async function registerWorker() {
  const supabase = getSupabase()
  const hostname = require('os').hostname()

  // 감사 로그에 워커 시작 기록
  await supabase.from('investment_audit_logs').insert({
    action: 'worker_started' as string,
    resource_type: 'worker',
    metadata: {
      hostname,
      pid: process.pid,
      nodeVersion: process.version,
      startedAt: new Date().toISOString(),
    },
  })

  logger.info({ hostname, pid: process.pid }, '워커 등록 완료')
}

// ============================================
// Graceful Shutdown
// ============================================

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info({ signal }, 'Graceful shutdown 시작...')

  try {
    // 1. 신호 프로세서 중지
    stopSignalProcessor()
    logger.info('신호 프로세서 중지')

    // 2. 주문 재조정 중지
    stopReconciler()
    logger.info('주문 재조정 중지')

    // 3. 시장 스케줄러 중지 (WebSocket 해제)
    await stopMarketScheduler()
    logger.info('시장 스케줄러 중지')

    // 4. 감사 로그 기록
    const supabase = getSupabase()
    await supabase.from('investment_audit_logs').insert({
      action: 'worker_stopped' as string,
      resource_type: 'worker',
      metadata: { signal, stoppedAt: new Date().toISOString() },
    })

    logger.info('Graceful shutdown 완료')
  } catch (err) {
    logger.error({ err }, 'Shutdown 중 오류')
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception')
  gracefulShutdown('uncaughtException')
})
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection')
})

// 실행
main().catch(err => {
  logger.fatal({ err }, '워커 시작 실패')
  process.exit(1)
})
