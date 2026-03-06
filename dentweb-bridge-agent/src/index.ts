import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection } from './dentweb-db'
import { checkStatus } from './api-client'
import { runSync } from './sync-service'
import { logger } from './logger'

async function main() {
  logger.info('========================================')
  logger.info('덴트웹 브릿지 에이전트 시작')
  logger.info(`Version: ${config.agentVersion}`)
  logger.info('========================================')

  // 설정 검증
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('설정 오류:')
    configErrors.forEach(err => logger.error(`  - ${err}`))
    logger.error('.env 파일을 확인해주세요.')
    process.exit(1)
  }

  // 1. 덴트웹 DB 연결 테스트
  logger.info('덴트웹 DB 연결 테스트 중...')
  const dbConnected = await testConnection()
  if (!dbConnected) {
    logger.error('덴트웹 DB 연결 실패. 설정을 확인해주세요.')
    process.exit(1)
  }

  // 2. Supabase API 연결 테스트
  logger.info('Supabase API 연결 테스트 중...')
  const statusResult = await checkStatus()
  if (!statusResult.success) {
    logger.error('Supabase API 연결 실패:', statusResult.error)
    logger.error('SUPABASE_URL, CLINIC_ID, API_KEY를 확인해주세요.')
    process.exit(1)
  }

  if (!statusResult.data?.is_active) {
    logger.warn('동기화가 비활성화 상태입니다. 대시보드에서 활성화해주세요.')
  }

  logger.info('모든 연결 테스트 성공!')
  logger.info(`동기화 주기: ${config.sync.intervalSeconds}초`)
  logger.info(`동기화 유형: ${config.sync.syncType}`)

  // 3. 최초 동기화 실행
  logger.info('최초 동기화 실행...')
  await runSync()

  // 4. 주기적 동기화 스케줄러
  const intervalMs = config.sync.intervalSeconds * 1000
  logger.info(`${config.sync.intervalSeconds}초 간격으로 동기화 스케줄링...`)

  const intervalId = setInterval(async () => {
    try {
      // 서버 상태 확인
      const status = await checkStatus()
      if (status.success && status.data?.is_active) {
        await runSync()
      } else if (status.success && !status.data?.is_active) {
        logger.info('동기화 비활성화 상태, 건너뜀')
      } else {
        logger.warn('서버 상태 확인 실패, 동기화 건너뜀')
      }
    } catch (error) {
      logger.error('스케줄된 동기화 실패:', error)
    }
  }, intervalMs)

  // 종료 시그널 처리
  const cleanup = async () => {
    logger.info('종료 시그널 수신, 정리 중...')
    clearInterval(intervalId)
    await disconnectDB()
    logger.info('브릿지 에이전트 종료')
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  logger.info('브릿지 에이전트 실행 중... (Ctrl+C로 종료)')
}

main().catch(error => {
  logger.error('Fatal error:', error)
  process.exit(1)
})
