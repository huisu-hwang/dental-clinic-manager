import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection, generateDemoPatients, patientToSyncData } from './dentweb-db'
import { checkStatus, syncPatients } from './api-client'
import { runSync } from './sync-service'
import { logger } from './logger'

const MAX_DB_RETRIES = 5
const DB_RETRY_DELAY = 10000

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function printBanner(): void {
  console.log('')
  console.log('  ╔══════════════════════════════════════════════════╗')
  console.log('  ║                                                  ║')
  console.log('  ║     덴트웹 브릿지 에이전트 v' + config.agentVersion.padEnd(22, ' ') + '║')
  console.log('  ║     DentWeb Bridge Agent                        ║')
  console.log('  ║                                                  ║')
  if (config.demoMode) {
    console.log('  ║     [데모 모드] 모의 데이터로 실행 중             ║')
  }
  console.log('  ╚══════════════════════════════════════════════════╝')
  console.log('')
}

function printStatus(label: string, value: string, ok: boolean): void {
  const icon = ok ? '[OK]' : '[!!]'
  console.log(`  ${icon} ${label}: ${value}`)
}

function printSuccess(message: string): void {
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────┐')
  console.log(`  │  ${message.padEnd(48, ' ')}│`)
  console.log('  └──────────────────────────────────────────────────┘')
  console.log('')
}

function printError(message: string): void {
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────┐')
  console.log(`  │  [실패] ${message.padEnd(42, ' ')}│`)
  console.log('  └──────────────────────────────────────────────────┘')
  console.log('')
}

async function connectWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    logger.info(`덴트웹 DB 연결 시도 (${attempt}/${MAX_DB_RETRIES})...`)
    const connected = await testConnection()
    if (connected) return true

    if (attempt < MAX_DB_RETRIES) {
      logger.warn(`${DB_RETRY_DELAY / 1000}초 후 재시도...`)
      await sleep(DB_RETRY_DELAY)
    }
  }
  return false
}

async function runDemoSync(): Promise<void> {
  logger.info('[데모] 모의 환자 데이터 동기화 시작...')
  const patients = generateDemoPatients(config.demo.patientCount)
  const syncData = patients.map(patientToSyncData)

  logger.info(`[데모] ${syncData.length}명의 환자 데이터를 API로 전송합니다...`)
  const result = await syncPatients(syncData, 'full')

  if (result.success) {
    logger.info('[데모] 동기화 성공!', {
      total: result.total_records,
      new: result.new_records,
      updated: result.updated_records,
    })
    printSuccess(`동기화 완료: ${result.total_records}건 전송 성공`)
  } else {
    logger.error('[데모] 동기화 실패:', { error: result.error })
    printError(`동기화 실패: ${result.error}`)
  }
}

async function main() {
  printBanner()

  logger.info('========================================')
  logger.info('덴트웹 브릿지 에이전트 시작')
  logger.info(`Version: ${config.agentVersion}`)
  if (config.demoMode) {
    logger.info('[데모 모드] MS SQL Server 없이 모의 데이터로 실행')
  }
  logger.info('========================================')

  // 설정 검증
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('설정 오류:')
    configErrors.forEach(err => logger.error(`  - ${err}`))
    logger.error('.env 파일을 확인해주세요.')
    printError('설정 오류 - .env 파일을 확인하세요')
    process.exit(1)
  }

  console.log('  --- 설정 확인 ---')
  printStatus('모드', config.demoMode ? '데모 (모의 데이터)' : '운영 (실제 DB)', true)
  printStatus('Supabase URL', config.supabase.url ? config.supabase.url.substring(0, 40) + '...' : '(미설정)', !!config.supabase.url)
  printStatus('Clinic ID', config.supabase.clinicId ? config.supabase.clinicId.substring(0, 20) + '...' : '(미설정)', !!config.supabase.clinicId)
  printStatus('API Key', config.supabase.apiKey ? config.supabase.apiKey.substring(0, 10) + '...' : '(미설정)', !!config.supabase.apiKey)
  printStatus('동기화 주기', `${config.sync.intervalSeconds}초`, true)
  printStatus('동기화 유형', config.sync.syncType, true)

  if (!config.demoMode) {
    printStatus('DB 서버', `${config.dentweb.server}:${config.dentweb.port}`, true)
    printStatus('DB 이름', config.dentweb.database, true)
    printStatus('인증 방식', config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : 'SQL Server', true)
  } else {
    printStatus('데모 환자 수', `${config.demo.patientCount}명`, true)
  }
  console.log('')

  if (config.demoMode) {
    // === 데모 모드 ===
    logger.info('[데모] DB 연결 건너뜀 (데모 모드)')
    printStatus('DB 연결', '건너뜀 (데모 모드)', true)

    // Supabase API 연결 테스트
    console.log('')
    console.log('  --- Supabase API 연결 테스트 ---')
    logger.info('Supabase API 연결 테스트 중...')
    const statusResult = await checkStatus()
    if (statusResult.success) {
      printStatus('Supabase API', '연결 성공', true)
      if (statusResult.data) {
        printStatus('동기화 상태', statusResult.data.is_active ? '활성' : '비활성', statusResult.data.is_active)
        printStatus('기존 환자 수', `${statusResult.data.total_patients}명`, true)
      }
    } else {
      printStatus('Supabase API', `연결 실패: ${statusResult.error}`, false)
      logger.warn('Supabase API 연결 실패, 동기화는 계속 시도합니다:', statusResult.error)
    }

    printSuccess('에이전트 시작 완료 (데모 모드)')

    // 데모 동기화 실행
    logger.info('[데모] 최초 동기화 실행...')
    await runDemoSync()

    // 주기적 데모 동기화
    const intervalMs = config.sync.intervalSeconds * 1000
    logger.info(`[데모] ${config.sync.intervalSeconds}초 간격으로 동기화 스케줄링...`)

    const intervalId = setInterval(async () => {
      try {
        const status = await checkStatus()
        if (status.success && status.data?.is_active) {
          await runDemoSync()
        } else if (status.success && !status.data?.is_active) {
          logger.info('[데모] 동기화 비활성화 상태, 건너뜀')
        } else {
          logger.warn('[데모] 서버 상태 확인 실패, 동기화를 시도합니다...')
          await runDemoSync()
        }
      } catch (error) {
        logger.error('[데모] 스케줄된 동기화 실패:', error)
      }
    }, intervalMs)

    // 종료 처리
    const cleanup = async () => {
      logger.info('종료 시그널 수신, 정리 중...')
      clearInterval(intervalId)
      logger.info('브릿지 에이전트 종료')
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    logger.info('[데모] 브릿지 에이전트 실행 중... (Ctrl+C로 종료)')

  } else {
    // === 운영 모드 ===

    // 1. 덴트웹 DB 연결 (재시도 포함)
    console.log('  --- DB 연결 ---')
    const dbConnected = await connectWithRetry()
    if (!dbConnected) {
      logger.error('덴트웹 DB 연결 실패. 설정을 확인해주세요.')
      printError('DB 연결 실패 - 설정을 확인하세요')
      process.exit(1)
    }
    printStatus('DB 연결', '성공', true)

    // 2. Supabase API 연결 테스트
    console.log('')
    console.log('  --- Supabase API 연결 테스트 ---')
    logger.info('Supabase API 연결 테스트 중...')
    const statusResult = await checkStatus()
    if (statusResult.success) {
      printStatus('Supabase API', '연결 성공', true)
      if (statusResult.data) {
        printStatus('동기화 상태', statusResult.data.is_active ? '활성' : '비활성', statusResult.data.is_active)
        printStatus('기존 환자 수', `${statusResult.data.total_patients}명`, true)
      }
    } else {
      printStatus('Supabase API', `연결 실패: ${statusResult.error}`, false)
      logger.warn('Supabase API 연결 실패, 동기화는 계속 시도합니다:', statusResult.error)
    }

    if (statusResult.success && !statusResult.data?.is_active) {
      logger.warn('동기화가 비활성화 상태입니다. 대시보드에서 활성화해주세요.')
    }

    printSuccess('에이전트 시작 완료')

    // 3. 최초 동기화 실행
    logger.info('최초 동기화 실행...')
    await runSync()

    // 4. 주기적 동기화 스케줄러
    const intervalMs = config.sync.intervalSeconds * 1000
    logger.info(`${config.sync.intervalSeconds}초 간격으로 동기화 스케줄링...`)

    const intervalId = setInterval(async () => {
      try {
        const status = await checkStatus()
        if (status.success && status.data?.is_active) {
          await runSync()
        } else if (status.success && !status.data?.is_active) {
          logger.info('동기화 비활성화 상태, 건너뜀')
        } else {
          // 서버 상태 확인 실패해도 동기화 시도 (오프라인 내성)
          logger.warn('서버 상태 확인 실패, 동기화를 시도합니다...')
          await runSync()
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
}

main().catch(error => {
  logger.error('Fatal error:', error)
  printError(`치명적 오류: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
