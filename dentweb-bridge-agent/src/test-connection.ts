import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection, listTables, listColumns } from './dentweb-db'
import { logger } from './logger'

async function main() {
  console.log('')
  console.log('  ==========================================')
  console.log('  DentWeb DB Connection Test')
  console.log('  ==========================================')
  console.log('')

  // Show connection settings
  const authMode = config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : `SQL Server (${config.dentweb.user || 'sa'})`
  console.log(`  Server  : ${config.dentweb.server}:${config.dentweb.port}`)
  console.log(`  Database: ${config.dentweb.database}`)
  console.log(`  Auth    : ${authMode}`)
  console.log('')

  logger.info('========================================')
  logger.info('DentWeb DB Connection Test')
  logger.info('========================================')

  // Validate config
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('Config errors:')
    configErrors.forEach(err => logger.error(`  - ${err}`))
    console.log('  [FAILED] Config error:')
    configErrors.forEach(err => console.log(`    - ${err}`))
    console.log('')
    process.exit(1)
  }

  // Connection test
  logger.info(`Server: ${config.dentweb.server}:${config.dentweb.port}`)
  logger.info(`Database: ${config.dentweb.database}`)

  console.log('  [..] Connecting to DB...')
  const connected = await testConnection()
  if (!connected) {
    console.log('')
    console.log('  ==========================================')
    console.log('  [FAILED] DB Connection Failed')
    console.log('  ==========================================')
    console.log('')
    if (!config.dentweb.useWindowsAuth) {
      console.log('  The password may be incorrect.')
      console.log(`  Account: ${config.dentweb.user || 'sa'}`)
      console.log('')
    }
    logger.error('Connection failed!')
    process.exit(1)
  }

  console.log('  [OK] DB Connection Successful!')
  console.log('')

  // List tables for verification
  logger.info('\n--- Table list ---')
  const tables = await listTables()
  const tableCount = tables.length
  console.log(`  [OK] ${tableCount} tables found in database`)

  // Check for key DentWeb tables (실제 한글 테이블명)
  const keyTables = ['TB_환자정보', 'TB_접수목록', 'TB_세부처치내역', 'TB_예약목록', 'TB_치료수가표']
  const foundKeyTables = keyTables.filter(t => tables.includes(t))
  if (foundKeyTables.length > 0) {
    console.log(`  [OK] DentWeb tables found: ${foundKeyTables.join(', ')}`)
  } else {
    console.log('  [!] DentWeb core tables not found (expected TB_환자정보 etc.)')
  }

  tables.forEach(t => logger.info(`  ${t}`))

  // Check key table columns
  for (const tableName of keyTables) {
    if (tables.includes(tableName)) {
      logger.info(`\n--- ${tableName} columns ---`)
      const columns = await listColumns(tableName)
      columns.forEach(c => logger.info(`  ${c.name} (${c.type})`))
    }
  }

  await disconnectDB()

  console.log('')
  console.log('  ==========================================')
  console.log('  [OK] All checks passed!')
  console.log('  ==========================================')
  console.log('')

  logger.info('\nTest complete!')
}

main().catch(error => {
  const msg = error instanceof Error ? error.message : String(error)
  logger.error('Error:', error)
  console.log('')
  console.log('  ==========================================')
  console.log(`  [FAILED] Error: ${msg}`)
  console.log('  ==========================================')
  console.log('')
  process.exit(1)
})
