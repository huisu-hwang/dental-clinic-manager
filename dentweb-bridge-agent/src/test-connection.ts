import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection, listTables, listColumns } from './dentweb-db'
import { logger } from './logger'

async function main() {
  logger.info('========================================')
  logger.info('덴트웹 DB 연결 테스트 및 스키마 탐색')
  logger.info('========================================')

  // 설정 검증
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('설정 오류:')
    configErrors.forEach(err => logger.error(`  - ${err}`))
    process.exit(1)
  }

  // 연결 테스트
  logger.info(`서버: ${config.dentweb.server}:${config.dentweb.port}`)
  logger.info(`데이터베이스: ${config.dentweb.database}`)

  const connected = await testConnection()
  if (!connected) {
    logger.error('연결 실패!')
    process.exit(1)
  }

  // 테이블 목록 조회
  logger.info('\n--- 테이블 목록 ---')
  const tables = await listTables()
  tables.forEach(t => logger.info(`  ${t}`))

  // 주요 테이블 컬럼 확인
  const targetTables = ['PATIENT', 'RECEIPT', 'TREAT_DETAIL', 'RESERVATION']
  for (const tableName of targetTables) {
    if (tables.includes(tableName)) {
      logger.info(`\n--- ${tableName} 컬럼 ---`)
      const columns = await listColumns(tableName)
      columns.forEach(c => logger.info(`  ${c.name} (${c.type})`))
    }
  }

  await disconnectDB()
  logger.info('\n테스트 완료!')
}

main().catch(error => {
  logger.error('Error:', error)
  process.exit(1)
})
