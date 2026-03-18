// 브릿지 에이전트 소스 파일들을 임베딩하여 ZIP 생성 시 사용
// GitHub 릴리즈 대신 서버에서 직접 ZIP을 생성하여 다운로드 제공

export interface BridgeAgentFile {
  path: string
  content: string
}

export function getBridgeAgentFiles(): BridgeAgentFile[] {
  return [
    {
      path: 'dentweb-bridge-agent/setup.bat',
      content: SETUP_BAT,
    },
    {
      path: 'dentweb-bridge-agent/package.json',
      content: PACKAGE_JSON,
    },
    {
      path: 'dentweb-bridge-agent/tsconfig.json',
      content: TSCONFIG_JSON,
    },
    {
      path: 'dentweb-bridge-agent/src/config.ts',
      content: CONFIG_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/index.ts',
      content: INDEX_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/dentweb-db.ts',
      content: DENTWEB_DB_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/sync-service.ts',
      content: SYNC_SERVICE_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/api-client.ts',
      content: API_CLIENT_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/logger.ts',
      content: LOGGER_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/state.ts',
      content: STATE_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/test-connection.ts',
      content: TEST_CONNECTION_TS,
    },
    {
      path: 'dentweb-bridge-agent/src/status-server.ts',
      content: STATUS_SERVER_TS,
    },
    {
      path: 'dentweb-bridge-agent/run.bat',
      content: RUN_BAT,
    },
    {
      path: 'dentweb-bridge-agent/scripts/install-service.js',
      content: INSTALL_SERVICE_JS,
    },
    {
      path: 'dentweb-bridge-agent/scripts/install-node.ps1',
      content: INSTALL_NODE_PS1,
    },
  ]
}

// .env 파일 생성
export function generateEnvContent(params: {
  clinicId: string
  apiKey: string
  syncInterval: number
}): string {
  return [
    '# 덴트웹 브릿지 에이전트 설정 (자동 생성됨)',
    '# setup.bat을 관리자 권한으로 실행하세요',
    '',
    '# 덴트웹 DB 설정 (setup.bat이 자동으로 감지합니다)',
    'DENTWEB_DB_SERVER=localhost',
    'DENTWEB_DB_PORT=1433',
    'DENTWEB_DB_DATABASE=DENTWEBDB',
    'DENTWEB_DB_USER=',
    'DENTWEB_DB_PASSWORD=',
    'DENTWEB_DB_AUTH=windows',
    '',
    '# Supabase API 설정 (자동 입력됨)',
    `SUPABASE_URL=https://beahjntkmkfhpcbhfnrr.supabase.co`,
    `CLINIC_ID=${params.clinicId}`,
    `API_KEY=${params.apiKey}`,
    '',
    '# 동기화 설정',
    `SYNC_INTERVAL_SECONDS=${params.syncInterval}`,
    'SYNC_TYPE=incremental',
    '',
    '# 데모 모드 (MS SQL Server 없이 모의 데이터로 테스트)',
    'DEMO_MODE=false',
    'DEMO_PATIENT_COUNT=10',
    '',
  ].join('\n')
}

// ============================================================
// 아래는 브릿지 에이전트 소스 파일 내용
// ============================================================

const SETUP_BAT = `@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title DentWeb Bridge Agent Setup

echo ==========================================
echo  DentWeb Bridge Agent - One-Click Setup
echo ==========================================
echo.

:: Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required. Restarting as admin...
    powershell -Command "Start-Process cmd -ArgumentList '/c, cd /d %~dp0 && %~nx0' -Verb RunAs"
    exit /b
)

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js is not installed.
    echo [*] Installing Node.js automatically...
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\\install-node.ps1"
    if %errorLevel% neq 0 (
        echo [X] Node.js installation failed.
        echo     Please install manually from https://nodejs.org
        pause
        exit /b 1
    )
    set "PATH=%ProgramFiles%\\nodejs;%PATH%"
)

echo [OK] Node.js found
for /f "tokens=*" %%i in ('node -v') do echo      Version: %%i
echo.

:: Install dependencies
echo [*] Installing packages...
cd /d "%~dp0"
call npm install
if %errorLevel% neq 0 (
    echo [X] npm install failed. Please check your network connection.
    pause
    exit /b 1
)
echo [OK] Packages installed
echo.

:: TypeScript build
echo [*] Building...
call npx tsc
if %errorLevel% neq 0 (
    echo [X] Build failed. Please check errors above.
    pause
    exit /b 1
)
echo [OK] Build complete
echo.

:: ======================================
:: SQL Server Auto-Detection
:: ======================================
echo [*] Detecting DentWeb environment...

set "DETECTED_SERVER=localhost"

if exist "C:\\DENTWEB" echo     DentWeb path found: C:\\DENTWEB
if exist "C:\\DENTWEBDB" echo     DB path found: C:\\DENTWEBDB
if exist "D:\\DENTWEB" echo     DentWeb path found: D:\\DENTWEB

sc query MSSQLSERVER >nul 2>&1
if !errorLevel! equ 0 (
    echo     [OK] SQL Server default instance detected
    set "DETECTED_SERVER=localhost"
) else (
    sc query "MSSQL$SQLEXPRESS" >nul 2>&1
    if !errorLevel! equ 0 (
        echo     [OK] SQL Server Express detected
        set "DETECTED_SERVER=localhost\\SQLEXPRESS"
    ) else (
        sc query "MSSQL$DENTWEB" >nul 2>&1
        if !errorLevel! equ 0 (
            echo     [OK] SQL Server DENTWEB instance detected
            set "DETECTED_SERVER=localhost\\DENTWEB"
        ) else (
            echo     [!] SQL Server service not found
        )
    )
)
echo.

:: Check .env file
if exist "%~dp0.env" (
    :: .env already exists (downloaded from web or previous install)
    echo [OK] Existing .env config found - proceeding automatically
    echo.

    :: Update DB_SERVER in .env with detected SQL Server address
    echo [*] Updating .env with detected SQL Server address...
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_SERVER=.*', 'DENTWEB_DB_SERVER=!DETECTED_SERVER!' | Set-Content '%~dp0.env'"
    echo [OK] DB Server: !DETECTED_SERVER!
    echo.

) else (
    echo ==========================================
    echo  Manual Setup
    echo ==========================================
    echo.
    echo  [!] No .env config file found.
    echo.
    echo  Recommended: Download from web dashboard
    echo  (Recall Settings ^> DentWeb tab ^> "One-Click Install" button)
    echo.
    echo  Enter the following info for manual setup:
    echo.

    :: Default values
    set "DB_SERVER=!DETECTED_SERVER!"
    set "DB_PORT=1433"
    set "DB_DATABASE=DENTWEBDB"
    set "SUPABASE_URL_VALUE=https://beahjntkmkfhpcbhfnrr.supabase.co"

    :: Web dashboard connection info
    echo  Copy the following 2 values from web dashboard
    echo  (Recall Settings ^> DentWeb tab):
    echo.
    echo  [1] Clinic ID
    set /p "CLINIC_ID_INPUT=      Clinic ID: "
    echo.
    echo  [2] API Key (starts with dw_)
    set /p "API_KEY_INPUT=      API Key: "
    echo.

    :: Create .env with Windows auth
    echo [*] Setting Windows authentication mode (no password needed)
    echo.

    (
        echo # DentWeb DB Settings
        echo DENTWEB_DB_SERVER=!DB_SERVER!
        echo DENTWEB_DB_PORT=!DB_PORT!
        echo DENTWEB_DB_DATABASE=!DB_DATABASE!
        echo DENTWEB_DB_USER=
        echo DENTWEB_DB_PASSWORD=
        echo DENTWEB_DB_AUTH=windows
        echo.
        echo # Supabase API Settings
        echo SUPABASE_URL=!SUPABASE_URL_VALUE!
        echo CLINIC_ID=!CLINIC_ID_INPUT!
        echo API_KEY=!API_KEY_INPUT!
        echo.
        echo # Sync Settings
        echo SYNC_INTERVAL_SECONDS=300
        echo SYNC_TYPE=incremental
    ) > "%~dp0.env"

    echo [OK] Config saved
    echo.
)

:: ======================================
:: DB Connection Test (Windows auth first)
:: ======================================
echo [*] Testing DB connection with Windows authentication...
node dist/test-connection.js 2>nul
if !errorLevel! neq 0 (
    echo.
    echo [!] Windows authentication failed.
    echo     Switching to SQL Server authentication (password required).
    echo.
    echo  ==========================================
    echo   SQL Server Password Required
    echo  ==========================================
    echo.
    echo   Enter the SQL Server 'sa' account password.
    echo   (This is the SQL Server administrator password,
    echo    set during SQL Server installation.)
    echo.
    set /p "DB_PASSWORD=  SQL Server 'sa' password: "
    echo.
    set /p "DB_USER_IN=  DB account (default: sa, press Enter to skip): "
    if "!DB_USER_IN!"=="" set "DB_USER_IN=sa"
    echo.

    :: Update .env to SQL auth
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_USER=.*', 'DENTWEB_DB_USER=!DB_USER_IN!' -replace 'DENTWEB_DB_PASSWORD=.*', 'DENTWEB_DB_PASSWORD=!DB_PASSWORD!' -replace 'DENTWEB_DB_AUTH=.*', 'DENTWEB_DB_AUTH=sql' | Set-Content '%~dp0.env'"

    echo [*] Retrying with SQL authentication...
    echo.
    node dist/test-connection.js
    if !errorLevel! neq 0 (
        echo.
        echo  ==========================================
        echo   [FAILED] DB Connection Failed
        echo  ==========================================
        echo.
        echo   The password may be incorrect, or SQL Server
        echo   may not be running. Please check:
        echo.
        echo   1. Is SQL Server running?
        echo   2. Is the password correct?
        echo   3. Is DentWeb installed on this PC?
        echo.
        echo   Config file: %~dp0.env (edit with Notepad)
        echo.
        set /p "CONTINUE=  Install service anyway? (Y/N): "
        if /i not "!CONTINUE!"=="Y" (
            echo  Please run setup.bat again.
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo  ==========================================
        echo   [OK] Password correct! DB connected.
        echo  ==========================================
        echo.
    )
) else (
    echo.
    echo  ==========================================
    echo   [OK] DB connected (Windows auth, no password needed)
    echo  ==========================================
    echo.
)

:: Register Windows service
echo [*] Registering as Windows service...
node scripts/install-service.js
if %errorLevel% neq 0 (
    echo [!] Service registration failed. Manual run:
    echo     cd %~dp0
    echo     npm start
    echo.
) else (
    echo [OK] Service registered!
    echo.
)

echo ==========================================
echo  Setup Complete!
echo ==========================================
echo.
echo  - Service: DentWeb Bridge Agent
echo  - Auto-starts on PC boot
echo  - Status: http://localhost:52800
echo  - Log: %~dp0logs\\bridge-agent.log
echo  - Config: %~dp0.env (edit with Notepad)
echo.
echo  If issues occur: run setup.bat again
echo.
pause
endlocal
`

const PACKAGE_JSON = `{
  "name": "dentweb-bridge-agent",
  "version": "1.0.0",
  "description": "덴트웹 DB → Supabase 동기화 브릿지 에이전트",
  "main": "dist/index.js",
  "scripts": {
    "build": "npx tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test-connection": "ts-node src/test-connection.ts",
    "install-service": "node scripts/install-service.js"
  },
  "dependencies": {
    "mssql": "^11.0.1",
    "node-cron": "^3.0.3",
    "node-windows": "^1.0.0-beta.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/mssql": "^9.1.5",
    "@types/node": "^20.11.0",
    "@types/node-cron": "^3.0.11",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
`

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`

const CONFIG_TS = `import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

export const config = {
  // 데모 모드: MS SQL Server 없이 모의 데이터로 테스트
  demoMode: process.env.DEMO_MODE === 'true',

  // 덴트웹 DB 설정
  dentweb: {
    server: process.env.DENTWEB_DB_SERVER || 'localhost',
    port: parseInt(process.env.DENTWEB_DB_PORT || '1433', 10),
    database: process.env.DENTWEB_DB_DATABASE || 'DENTWEBDB',
    user: process.env.DENTWEB_DB_USER || '',
    password: process.env.DENTWEB_DB_PASSWORD || '',
    dbPath: process.env.DENTWEB_DB_PATH || 'c:\\\\DENTWEBDB',
    // Windows 인증: true면 user/password 대신 Windows 로그인 계정으로 접속
    useWindowsAuth: process.env.DENTWEB_DB_AUTH === 'windows' ||
      (!process.env.DENTWEB_DB_USER && !process.env.DENTWEB_DB_PASSWORD),
  },

  // Supabase API 설정
  supabase: {
    url: process.env.SUPABASE_URL || '',
    clinicId: process.env.CLINIC_ID || '',
    apiKey: process.env.API_KEY || '',
  },

  // 동기화 설정
  sync: {
    intervalSeconds: parseInt(process.env.SYNC_INTERVAL_SECONDS || '300', 10),
    syncType: (process.env.SYNC_TYPE || 'incremental') as 'full' | 'incremental',
  },

  // 데모 모드 설정
  demo: {
    patientCount: parseInt(process.env.DEMO_PATIENT_COUNT || '10', 10),
  },

  // 상태 서버 포트 (브라우저에서 상태 확인용)
  statusPort: parseInt(process.env.STATUS_PORT || '52800', 10),

  // 에이전트 버전
  agentVersion: '1.0.0',
}

export function validateConfig(): string[] {
  const errors: string[] = []

  // 데모 모드에서는 DB 설정 불필요
  if (!config.demoMode) {
    // Windows 인증이 아닌 경우에만 user/password 필수
    if (!config.dentweb.useWindowsAuth) {
      if (!config.dentweb.user) errors.push('DENTWEB_DB_USER is required (or use Windows auth)')
      if (!config.dentweb.password) errors.push('DENTWEB_DB_PASSWORD is required (or use Windows auth)')
    }
  }
  if (!config.supabase.url) errors.push('SUPABASE_URL is required')
  if (!config.supabase.clinicId) errors.push('CLINIC_ID is required')
  if (!config.supabase.apiKey) errors.push('API_KEY is required')

  return errors
}
`

const INDEX_TS = `import readline from 'readline'
import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection, generateDemoPatients, patientToSyncData } from './dentweb-db'
import { checkStatus, syncPatients } from './api-client'
import { runSync } from './sync-service'
import { logger } from './logger'
import { startStatusServer, updateAgentStatus } from './status-server'

const MAX_DB_RETRIES = 5
const DB_RETRY_DELAY = 10000

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Windows에서 창이 바로 닫히지 않도록 키 입력 대기
function waitForKeypress(message?: string): Promise<void> {
  return new Promise(resolve => {
    console.log('')
    console.log(message || '  아무 키나 누르면 종료합니다...')
    console.log('')
    if (!process.stdin.isTTY) { resolve(); return }
    const rl = readline.createInterface({ input: process.stdin })
    rl.on('line', () => { rl.close(); resolve() })
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.once('data', () => { process.stdin.setRawMode!(false); rl.close(); resolve() })
    }
  })
}

// 오류 발생 시 메시지 표시 후 키 입력 대기하고 종료
async function exitWithError(message: string, exitCode = 1): Promise<never> {
  printError(message)
  logger.error(message)
  await waitForKeypress('  오류가 발생했습니다. 위 내용을 확인한 후 아무 키나 누르면 종료합니다...')
  process.exit(exitCode)
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
  console.log(\`  \${icon} \${label}: \${value}\`)
}

function printSuccess(message: string): void {
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────┐')
  console.log(\`  │  \${message.padEnd(48, ' ')}│\`)
  console.log('  └──────────────────────────────────────────────────┘')
  console.log('')
}

function printError(message: string): void {
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────┐')
  console.log(\`  │  [실패] \${message.padEnd(42, ' ')}│\`)
  console.log('  └──────────────────────────────────────────────────┘')
  console.log('')
}

async function connectWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    logger.info(\`덴트웹 DB 연결 시도 (\${attempt}/\${MAX_DB_RETRIES})...\`)
    console.log(\`  [..] 덴트웹 DB 연결 시도 (\${attempt}/\${MAX_DB_RETRIES})...\`)
    try {
      const connected = await testConnection()
      if (connected) return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(\`연결 실패: \${msg}\`)
      updateAgentStatus({ dbError: msg })
    }

    if (attempt < MAX_DB_RETRIES) {
      logger.warn(\`\${DB_RETRY_DELAY / 1000}초 후 재시도...\`)
      console.log(\`  [!!] 연결 실패. \${DB_RETRY_DELAY / 1000}초 후 재시도...\`)
      await sleep(DB_RETRY_DELAY)
    }
  }
  return false
}

async function runDemoSync(): Promise<void> {
  logger.info('[데모] 모의 환자 데이터 동기화 시작...')
  const patients = generateDemoPatients(config.demo.patientCount)
  const syncData = patients.map(patientToSyncData)

  logger.info(\`[데모] \${syncData.length}명의 환자 데이터를 API로 전송합니다...\`)
  const result = await syncPatients(syncData, 'full')

  if (result.success) {
    logger.info('[데모] 동기화 성공!', {
      total: result.total_records,
      new: result.new_records,
      updated: result.updated_records,
    })
    updateAgentStatus({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'success',
      lastSyncPatientCount: result.total_records,
    })
    printSuccess(\`동기화 완료: \${result.total_records}건 전송 성공\`)
  } else {
    logger.error('[데모] 동기화 실패:', { error: result.error })
    updateAgentStatus({ lastSyncStatus: 'error' })
    printError(\`동기화 실패: \${result.error}\`)
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  updateAgentStatus({ startedAt, demoMode: config.demoMode })

  printBanner()

  logger.info('========================================')
  logger.info('덴트웹 브릿지 에이전트 시작')
  logger.info(\`Version: \${config.agentVersion}\`)
  if (config.demoMode) {
    logger.info('[데모 모드] MS SQL Server 없이 모의 데이터로 실행')
  }
  logger.info('========================================')

  // 상태 확인 서버 시작 (가장 먼저)
  console.log('  --- 상태 서버 ---')
  startStatusServer()
  console.log('')

  // 설정 검증
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('설정 오류:')
    configErrors.forEach(err => {
      logger.error(\`  - \${err}\`)
      console.log(\`  [!!] \${err}\`)
    })
    logger.error('.env 파일을 확인해주세요.')
    console.log('')
    console.log('  .env 파일 위치: 브릿지 에이전트 폴더 내 .env')
    console.log('  웹 대시보드에서 다시 다운로드하면 자동 설정됩니다.')
    await exitWithError('설정 오류 - .env 파일을 확인하세요')
  }

  console.log('  --- 설정 확인 ---')
  printStatus('모드', config.demoMode ? '데모 (모의 데이터)' : '운영 (실제 DB)', true)
  printStatus('Supabase URL', config.supabase.url ? config.supabase.url.substring(0, 40) + '...' : '(미설정)', !!config.supabase.url)
  printStatus('Clinic ID', config.supabase.clinicId ? config.supabase.clinicId.substring(0, 20) + '...' : '(미설정)', !!config.supabase.clinicId)
  printStatus('API Key', config.supabase.apiKey ? config.supabase.apiKey.substring(0, 10) + '...' : '(미설정)', !!config.supabase.apiKey)
  printStatus('동기화 주기', \`\${config.sync.intervalSeconds}초\`, true)
  printStatus('동기화 유형', config.sync.syncType, true)

  if (!config.demoMode) {
    printStatus('DB 서버', \`\${config.dentweb.server}:\${config.dentweb.port}\`, true)
    printStatus('DB 이름', config.dentweb.database, true)
    printStatus('인증 방식', config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : 'SQL Server', true)
  } else {
    printStatus('데모 환자 수', \`\${config.demo.patientCount}명\`, true)
  }
  console.log('')

  if (config.demoMode) {
    // === 데모 모드 ===
    logger.info('[데모] DB 연결 건너뜀 (데모 모드)')
    printStatus('DB 연결', '건너뜀 (데모 모드)', true)
    updateAgentStatus({ dbConnected: true })

    // Supabase API 연결 테스트
    console.log('')
    console.log('  --- Supabase API 연결 테스트 ---')
    logger.info('Supabase API 연결 테스트 중...')
    const statusResult = await checkStatus()
    if (statusResult.success) {
      printStatus('Supabase API', '연결 성공', true)
      updateAgentStatus({ supabaseConnected: true })
      if (statusResult.data) {
        printStatus('동기화 상태', statusResult.data.is_active ? '활성' : '비활성', statusResult.data.is_active)
        printStatus('기존 환자 수', \`\${statusResult.data.total_patients}명\`, true)
      }
    } else {
      printStatus('Supabase API', \`연결 실패: \${statusResult.error}\`, false)
      updateAgentStatus({ supabaseConnected: false, supabaseError: statusResult.error || '' })
      logger.warn('Supabase API 연결 실패, 동기화는 계속 시도합니다:', statusResult.error)
    }

    updateAgentStatus({ running: true })
    printSuccess('에이전트 시작 완료 (데모 모드)')

    // 데모 동기화 실행
    logger.info('[데모] 최초 동기화 실행...')
    await runDemoSync()

    // 주기적 데모 동기화
    const intervalMs = config.sync.intervalSeconds * 1000
    logger.info(\`[데모] \${config.sync.intervalSeconds}초 간격으로 동기화 스케줄링...\`)

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
      updateAgentStatus({ running: false })
      logger.info('브릿지 에이전트 종료')
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    logger.info('[데모] 브릿지 에이전트 실행 중... (Ctrl+C로 종료)')
    console.log('  브릿지 에이전트가 백그라운드에서 실행 중입니다.')
    console.log('  이 창을 닫지 마세요. (Ctrl+C로 종료)')
    console.log('')

  } else {
    // === 운영 모드 ===

    // 1. 덴트웹 DB 연결 (재시도 포함)
    console.log('  --- 덴트웹 DB 연결 ---')
    const dbConnected = await connectWithRetry()
    if (!dbConnected) {
      logger.error('덴트웹 DB 연결 실패. 설정을 확인해주세요.')
      updateAgentStatus({ dbConnected: false })
      console.log('')
      console.log('  확인사항:')
      console.log('    1. SQL Server가 실행 중인가요?')
      console.log('    2. 덴트웹이 이 PC에 설치되어 있나요?')
      console.log('    3. .env 파일의 DB 서버 주소가 맞나요?')
      console.log(\`       현재 설정: \${config.dentweb.server}:\${config.dentweb.port}\`)
      console.log(\`       데이터베이스: \${config.dentweb.database}\`)
      console.log(\`       인증: \${config.dentweb.useWindowsAuth ? 'Windows' : 'SQL Server (' + config.dentweb.user + ')'}\`)
      console.log('')
      console.log('  로그 파일: logs/bridge-agent.log')
      await exitWithError('DB 연결 실패 - 위 확인사항을 점검하세요')
    }
    printStatus('DB 연결', '성공', true)
    updateAgentStatus({ dbConnected: true })

    // 2. Supabase API 연결 테스트
    console.log('')
    console.log('  --- Supabase API 연결 테스트 ---')
    logger.info('Supabase API 연결 테스트 중...')
    const statusResult = await checkStatus()
    if (statusResult.success) {
      printStatus('Supabase API', '연결 성공', true)
      updateAgentStatus({ supabaseConnected: true })
      if (statusResult.data) {
        printStatus('동기화 상태', statusResult.data.is_active ? '활성' : '비활성', statusResult.data.is_active)
        printStatus('기존 환자 수', \`\${statusResult.data.total_patients}명\`, true)
      }
    } else {
      printStatus('Supabase API', \`연결 실패: \${statusResult.error}\`, false)
      updateAgentStatus({ supabaseConnected: false, supabaseError: statusResult.error || '' })
      logger.warn('Supabase API 연결 실패, 동기화는 계속 시도합니다:', statusResult.error)
    }

    if (statusResult.success && !statusResult.data?.is_active) {
      logger.warn('동기화가 비활성화 상태입니다. 대시보드에서 활성화해주세요.')
    }

    updateAgentStatus({ running: true })
    printSuccess('에이전트 시작 완료')

    // 3. 최초 동기화 실행
    logger.info('최초 동기화 실행...')
    console.log('  [..] 최초 동기화 실행 중...')
    await runSync()
    console.log('  [OK] 최초 동기화 완료')

    // 4. 주기적 동기화 스케줄러
    const intervalMs = config.sync.intervalSeconds * 1000
    logger.info(\`\${config.sync.intervalSeconds}초 간격으로 동기화 스케줄링...\`)

    const intervalId = setInterval(async () => {
      try {
        const status = await checkStatus()
        if (status.success && status.data?.is_active) {
          await runSync()
        } else if (status.success && !status.data?.is_active) {
          logger.info('동기화 비활성화 상태, 건너뜀')
        } else {
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
      updateAgentStatus({ running: false })
      await disconnectDB()
      logger.info('브릿지 에이전트 종료')
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    logger.info('브릿지 에이전트 실행 중... (Ctrl+C로 종료)')
    console.log('')
    console.log('  ════════════════════════════════════════════════')
    console.log('  브릿지 에이전트가 실행 중입니다.')
    console.log(\`  동기화 주기: \${config.sync.intervalSeconds}초\`)
    console.log('  이 창을 닫지 마세요. (Ctrl+C로 종료)')
    console.log('  ════════════════════════════════════════════════')
    console.log('')
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error)
  logger.error('Fatal error:', error)
  printError(\`치명적 오류: \${message}\`)
  console.log('')
  console.log('  상세 로그: logs/bridge-agent.log')
  await waitForKeypress('  오류가 발생했습니다. 아무 키나 누르면 종료합니다...')
  process.exit(1)
})

// 예상치 못한 오류도 창이 닫히지 않도록 처리
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error)
  printError(\`예상치 못한 오류: \${error.message}\`)
  console.log('')
  console.log('  상세 로그: logs/bridge-agent.log')
  await waitForKeypress('  오류가 발생했습니다. 아무 키나 누르면 종료합니다...')
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
})
`

const DENTWEB_DB_TS = `import sql from 'mssql'
import { config } from './config'
import { logger } from './logger'

interface DentwebPatientRow {
  dentweb_patient_id: string
  chart_number: string | null
  patient_name: string
  phone_number: string | null
  birth_date: Date | null
  gender: string | null
  last_visit_date: Date | null
  last_treatment_type: string | null
  next_appointment_date: Date | null
  registration_date: Date | null
}

// ========================================
// 데모 모드: 모의 환자 데이터 생성
// ========================================

const DEMO_LAST_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const DEMO_FIRST_NAMES = ['민수', '서연', '지훈', '수빈', '현우', '하은', '준호', '다은', '성민', '예진', '동현', '소영', '태희', '유나', '재혁']
const DEMO_TREATMENTS = ['스케일링', '레진충전', '크라운', '신경치료', '임플란트', '교정', '발치', '미백', '잇몸치료', '보철']

function generateDemoPhone(): string {
  const mid = String(Math.floor(1000 + Math.random() * 9000))
  const last = String(Math.floor(1000 + Math.random() * 9000))
  return \\\`010-\\\${mid}-\\\${last}\\\`
}

function generateDemoDate(yearsBack: number): Date {
  const now = new Date()
  const past = new Date(now.getTime() - Math.random() * yearsBack * 365 * 24 * 60 * 60 * 1000)
  return past
}

function generateDemoBirthDate(): Date {
  const year = 1950 + Math.floor(Math.random() * 60)
  const month = Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return new Date(year, month, day)
}

export function generateDemoPatients(count: number): DentwebPatientRow[] {
  const patients: DentwebPatientRow[] = []

  for (let i = 1; i <= count; i++) {
    const lastName = DEMO_LAST_NAMES[Math.floor(Math.random() * DEMO_LAST_NAMES.length)]
    const firstName = DEMO_FIRST_NAMES[Math.floor(Math.random() * DEMO_FIRST_NAMES.length)]
    const treatment = DEMO_TREATMENTS[Math.floor(Math.random() * DEMO_TREATMENTS.length)]

    patients.push({
      dentweb_patient_id: String(10000 + i),
      chart_number: \\\`C\\\${String(i).padStart(5, '0')}\\\`,
      patient_name: \\\`\\\${lastName}\\\${firstName}\\\`,
      phone_number: generateDemoPhone(),
      birth_date: generateDemoBirthDate(),
      gender: Math.random() > 0.5 ? 'M' : 'F',
      last_visit_date: generateDemoDate(1),
      last_treatment_type: treatment,
      next_appointment_date: Math.random() > 0.3 ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
      registration_date: generateDemoDate(5),
    })
  }

  logger.info(\\\`[데모] \\\${count}명의 모의 환자 데이터 생성 완료\\\`)
  return patients
}

// ========================================
// 실제 DB 쿼리
// ========================================

// MS SQL Server 연결 설정
function buildSqlConfig(): sql.config {
  const baseConfig: sql.config = {
    server: config.dentweb.server,
    port: config.dentweb.port,
    database: config.dentweb.database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 30000,
      trustedConnection: config.dentweb.useWindowsAuth,
    },
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 30000,
    },
  }

  if (config.dentweb.useWindowsAuth) {
    logger.info('Windows 인증 모드로 연결합니다')
    // Windows 인증: NTLM 사용 (현재 Windows 로그인 계정)
    baseConfig.authentication = {
      type: 'ntlm',
      options: {
        domain: '',
        userName: '',
        password: '',
      },
    }
  } else {
    logger.info(\`SQL Server 인증 모드로 연결합니다 (계정: \${config.dentweb.user})\`)
    baseConfig.user = config.dentweb.user
    baseConfig.password = config.dentweb.password
  }

  return baseConfig
}

const sqlConfig = buildSqlConfig()

let pool: sql.ConnectionPool | null = null

// DB 연결
export async function connectDB(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool
  }

  try {
    logger.info('Connecting to DentWeb SQL Server...')
    pool = await new sql.ConnectionPool(sqlConfig).connect()
    logger.info('Connected to DentWeb SQL Server successfully')
    return pool
  } catch (error) {
    logger.error('Failed to connect to DentWeb SQL Server', error)
    throw error
  }
}

// DB 연결 종료
export async function disconnectDB(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
    logger.info('Disconnected from DentWeb SQL Server')
  }
}

// 연결 테스트
export async function testConnection(): Promise<boolean> {
  try {
    const conn = await connectDB()
    const result = await conn.request().query('SELECT 1 AS test')
    logger.info('Connection test successful', result.recordset)
    return true
  } catch (error) {
    logger.error('Connection test failed', error)
    return false
  }
}

// 전체 환자 목록 조회 (전체 동기화)
export async function getAllPatients(): Promise<DentwebPatientRow[]> {
  const conn = await connectDB()

  try {
    const result = await conn.request().query(\`
      SELECT
        CAST(PT_ID AS VARCHAR) AS dentweb_patient_id,
        PT_CHARTNO AS chart_number,
        PT_NAME AS patient_name,
        PT_HP AS phone_number,
        PT_BIRTH AS birth_date,
        PT_SEX AS gender,
        (SELECT MAX(RCP_DATE) FROM RECEIPT WHERE RCP_PTID = PATIENT.PT_ID) AS last_visit_date,
        (SELECT TOP 1 TX_NAME FROM TREAT_DETAIL
         INNER JOIN RECEIPT ON TREAT_DETAIL.TD_RCPID = RECEIPT.RCP_ID
         WHERE RECEIPT.RCP_PTID = PATIENT.PT_ID
         ORDER BY RECEIPT.RCP_DATE DESC) AS last_treatment_type,
        PT_MEMO_DATE AS next_appointment_date,
        PT_FIRSTDATE AS registration_date
      FROM PATIENT
      WHERE PT_NAME IS NOT NULL AND PT_NAME != ''
      ORDER BY PT_ID
    \`)

    return result.recordset.map(formatPatientRow)
  } catch (error) {
    logger.error('Failed to query all patients', error)
    throw error
  }
}

// 변경된 환자만 조회 (증분 동기화)
export async function getUpdatedPatients(since: Date): Promise<DentwebPatientRow[]> {
  const conn = await connectDB()

  try {
    const result = await conn.request()
      .input('sinceDate', sql.DateTime, since)
      .query(\`
        SELECT
          CAST(PT_ID AS VARCHAR) AS dentweb_patient_id,
          PT_CHARTNO AS chart_number,
          PT_NAME AS patient_name,
          PT_HP AS phone_number,
          PT_BIRTH AS birth_date,
          PT_SEX AS gender,
          (SELECT MAX(RCP_DATE) FROM RECEIPT WHERE RCP_PTID = PATIENT.PT_ID) AS last_visit_date,
          (SELECT TOP 1 TX_NAME FROM TREAT_DETAIL
           INNER JOIN RECEIPT ON TREAT_DETAIL.TD_RCPID = RECEIPT.RCP_ID
           WHERE RECEIPT.RCP_PTID = PATIENT.PT_ID
           ORDER BY RECEIPT.RCP_DATE DESC) AS last_treatment_type,
          PT_MEMO_DATE AS next_appointment_date,
          PT_FIRSTDATE AS registration_date
        FROM PATIENT
        WHERE PT_NAME IS NOT NULL AND PT_NAME != ''
          AND (PT_EDITDATE >= @sinceDate
               OR PT_ID IN (SELECT RCP_PTID FROM RECEIPT WHERE RCP_DATE >= @sinceDate))
        ORDER BY PT_ID
      \`)

    return result.recordset.map(formatPatientRow)
  } catch (error) {
    logger.error('Failed to query updated patients', error)
    throw error
  }
}

// DB 스키마 확인 (테이블 목록)
export async function listTables(): Promise<string[]> {
  const conn = await connectDB()

  try {
    const result = await conn.request().query(\`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    \`)
    return result.recordset.map(r => r.TABLE_NAME)
  } catch (error) {
    logger.error('Failed to list tables', error)
    throw error
  }
}

// 특정 테이블 컬럼 확인
export async function listColumns(tableName: string): Promise<Array<{ name: string; type: string }>> {
  const conn = await connectDB()

  try {
    const result = await conn.request()
      .input('tableName', sql.VarChar, tableName)
      .query(\`
        SELECT COLUMN_NAME AS name, DATA_TYPE AS type
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      \`)
    return result.recordset
  } catch (error) {
    logger.error(\`Failed to list columns for \${tableName}\`, error)
    throw error
  }
}

// 날짜 포맷팅 헬퍼
function formatDate(date: Date | null): string | null {
  if (!date) return null
  return date.toISOString().split('T')[0]
}

// 환자 row 포맷팅
function formatPatientRow(row: Record<string, unknown>): DentwebPatientRow {
  return {
    dentweb_patient_id: String(row.dentweb_patient_id),
    chart_number: row.chart_number as string | null,
    patient_name: String(row.patient_name || ''),
    phone_number: row.phone_number as string | null,
    birth_date: row.birth_date as Date | null,
    gender: row.gender as string | null,
    last_visit_date: row.last_visit_date as Date | null,
    last_treatment_type: row.last_treatment_type as string | null,
    next_appointment_date: row.next_appointment_date as Date | null,
    registration_date: row.registration_date as Date | null,
  }
}

// 환자 데이터를 동기화용 JSON으로 변환
export function patientToSyncData(patient: DentwebPatientRow): Record<string, unknown> {
  return {
    dentweb_patient_id: patient.dentweb_patient_id,
    chart_number: patient.chart_number,
    patient_name: patient.patient_name,
    phone_number: patient.phone_number,
    birth_date: formatDate(patient.birth_date),
    gender: patient.gender,
    last_visit_date: formatDate(patient.last_visit_date),
    last_treatment_type: patient.last_treatment_type,
    next_appointment_date: formatDate(patient.next_appointment_date),
    registration_date: formatDate(patient.registration_date),
    is_active: true,
  }
}
`

const SYNC_SERVICE_TS = `import { getAllPatients, getUpdatedPatients, patientToSyncData } from './dentweb-db'
import { syncPatients } from './api-client'
import { config } from './config'
import { logger } from './logger'
import { loadState, saveState } from './state'

let isSyncing = false
const state = loadState()

// 상태 파일에서 마지막 동기화 날짜 복원
let lastSyncDate: Date | null = state.lastSyncDate ? new Date(state.lastSyncDate) : null

if (lastSyncDate) {
  logger.info(\`이전 동기화 상태 복원: \${lastSyncDate.toISOString()} (총 \${state.totalSyncs}회 동기화)\`)
}

// 동기화 실행
export async function runSync(): Promise<void> {
  if (isSyncing) {
    logger.warn('Sync already in progress, skipping...')
    return
  }

  isSyncing = true
  const startTime = Date.now()

  try {
    let patients
    let syncType: 'full' | 'incremental'

    if (!lastSyncDate || config.sync.syncType === 'full') {
      syncType = 'full'
      logger.info('Starting full sync...')
      patients = await getAllPatients()
    } else {
      syncType = 'incremental'
      logger.info(\`Starting incremental sync (since \${lastSyncDate.toISOString()})...\`)
      patients = await getUpdatedPatients(lastSyncDate)
    }

    logger.info(\`Found \${patients.length} patients to sync\`)

    if (patients.length === 0) {
      logger.info('No patients to sync, skipping API call')
      lastSyncDate = new Date()
      state.lastSyncDate = lastSyncDate.toISOString()
      state.lastSyncStatus = 'success'
      state.consecutiveErrors = 0
      saveState(state)
      return
    }

    const syncData = patients.map(patientToSyncData)
    const result = await syncPatients(syncData, syncType)

    if (result.success) {
      lastSyncDate = new Date()
      const duration = Date.now() - startTime
      logger.info(\`Sync completed successfully in \${duration}ms\`, {
        total: result.total_records,
        new: result.new_records,
        updated: result.updated_records,
      })
      state.lastSyncDate = lastSyncDate.toISOString()
      state.lastSyncStatus = 'success'
      state.lastSyncPatientCount = result.total_records
      state.consecutiveErrors = 0
      state.totalSyncs++
      saveState(state)
    } else {
      logger.error('Sync failed', { error: result.error })
      state.lastSyncStatus = 'error'
      state.consecutiveErrors++
      saveState(state)
    }

  } catch (error) {
    logger.error('Sync error', error)
    state.lastSyncStatus = 'error'
    state.consecutiveErrors++
    saveState(state)
  } finally {
    isSyncing = false
  }
}

// 동기화 상태
export function getSyncStatus() {
  return {
    isSyncing,
    lastSyncDate,
    consecutiveErrors: state.consecutiveErrors,
    totalSyncs: state.totalSyncs,
  }
}
`

const API_CLIENT_TS = `import { config } from './config'
import { logger } from './logger'

interface SyncResponse {
  success: boolean
  sync_log_id?: string
  total_records: number
  new_records: number
  updated_records: number
  error?: string
}

interface StatusResponse {
  success: boolean
  data?: {
    is_active: boolean
    sync_interval_seconds: number
    last_sync_at: string | null
    last_sync_status: string | null
    total_patients: number
  }
  error?: string
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [2000, 4000, 8000]

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 8000
        logger.warn(\`네트워크 오류, \${delay / 1000}초 후 재시도 (\${attempt + 1}/\${retries})...\`, {
          error: lastError.message,
        })
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error('All retries failed')
}

// Supabase API로 환자 데이터 동기화 전송
export async function syncPatients(
  patients: Record<string, unknown>[],
  syncType: 'full' | 'incremental'
): Promise<SyncResponse> {
  const url = \`\${config.supabase.url}/api/dentweb/sync\`

  try {
    logger.info(\`Sending \${patients.length} patients to sync API (\${syncType})...\`)

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clinic_id: config.supabase.clinicId,
        api_key: config.supabase.apiKey,
        sync_type: syncType,
        patients,
        agent_version: config.agentVersion,
      }),
    })

    const data = await response.json() as SyncResponse

    if (!response.ok) {
      logger.error(\`Sync API responded with \${response.status}\`, data)
      return {
        success: false,
        total_records: patients.length,
        new_records: 0,
        updated_records: 0,
        error: data.error || \`HTTP \${response.status}\`,
      }
    }

    logger.info('Sync completed', {
      total: data.total_records,
      new: data.new_records,
      updated: data.updated_records,
    })

    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Sync API call failed (all retries exhausted)', { error: message })
    return {
      success: false,
      total_records: patients.length,
      new_records: 0,
      updated_records: 0,
      error: message,
    }
  }
}

// 동기화 상태 확인 (heartbeat)
export async function checkStatus(): Promise<StatusResponse> {
  const url = \`\${config.supabase.url}/api/dentweb/status?clinic_id=\${config.supabase.clinicId}&api_key=\${config.supabase.apiKey}\`

  try {
    const response = await fetchWithRetry(url, undefined, 1)
    const data = await response.json() as StatusResponse

    if (!response.ok) {
      return { success: false, error: data.error || \`HTTP \${response.status}\` }
    }

    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
`

const LOGGER_TS = `import fs from 'fs'
import path from 'path'

const LOG_DIR = path.resolve(__dirname, '../logs')
const LOG_FILE = path.join(LOG_DIR, 'bridge-agent.log')

// 로그 디렉토리 생성
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19)
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const timestamp = formatDate(new Date())
  const logLine = \`[\${timestamp}] [\${level}] \${message}\${data ? ' ' + JSON.stringify(data) : ''}\`

  // 콘솔 출력
  if (level === 'ERROR') {
    console.error(logLine)
  } else if (level === 'WARN') {
    console.warn(logLine)
  } else {
    console.log(logLine)
  }

  // 파일 출력
  try {
    fs.appendFileSync(LOG_FILE, logLine + '\\n')
  } catch {
    // 로깅 실패는 무시
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log('INFO', message, data),
  warn: (message: string, data?: unknown) => log('WARN', message, data),
  error: (message: string, data?: unknown) => log('ERROR', message, data),
  debug: (message: string, data?: unknown) => log('DEBUG', message, data),
}
`

const STATE_TS = `import fs from 'fs'
import path from 'path'
import { logger } from './logger'

const STATE_FILE = path.resolve(__dirname, '../data/sync-state.json')
const STATE_DIR = path.dirname(STATE_FILE)

interface SyncState {
  lastSyncDate: string | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncPatientCount: number
  consecutiveErrors: number
  totalSyncs: number
}

const defaultState: SyncState = {
  lastSyncDate: null,
  lastSyncStatus: null,
  lastSyncPatientCount: 0,
  consecutiveErrors: 0,
  totalSyncs: 0,
}

export function loadState(): SyncState {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true })
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      return { ...defaultState, ...JSON.parse(raw) }
    }
  } catch (error) {
    logger.warn('상태 파일 로드 실패, 기본값 사용', error)
  }
  return { ...defaultState }
}

export function saveState(state: SyncState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true })
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    logger.warn('상태 파일 저장 실패', error)
  }
}
`

const TEST_CONNECTION_TS = `import { config, validateConfig } from './config'
import { connectDB, disconnectDB, testConnection, listTables, listColumns } from './dentweb-db'
import { logger } from './logger'

async function main() {
  console.log('')
  console.log('  ==========================================')
  console.log('  DentWeb DB Connection Test')
  console.log('  ==========================================')
  console.log('')

  // Show connection settings
  const authMode = config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : \`SQL Server (\${config.dentweb.user || 'sa'})\`
  console.log(\`  Server  : \${config.dentweb.server}:\${config.dentweb.port}\`)
  console.log(\`  Database: \${config.dentweb.database}\`)
  console.log(\`  Auth    : \${authMode}\`)
  console.log('')

  logger.info('========================================')
  logger.info('DentWeb DB Connection Test')
  logger.info('========================================')

  // Validate config
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    logger.error('Config errors:')
    configErrors.forEach(err => logger.error(\`  - \${err}\`))
    console.log('  [FAILED] Config error:')
    configErrors.forEach(err => console.log(\`    - \${err}\`))
    console.log('')
    process.exit(1)
  }

  // Connection test
  logger.info(\`Server: \${config.dentweb.server}:\${config.dentweb.port}\`)
  logger.info(\`Database: \${config.dentweb.database}\`)

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
      console.log(\`  Account: \${config.dentweb.user || 'sa'}\`)
      console.log('')
    }
    logger.error('Connection failed!')
    process.exit(1)
  }

  console.log('  [OK] DB Connection Successful!')
  console.log('')

  // List tables for verification
  logger.info('\\n--- Table list ---')
  const tables = await listTables()
  const tableCount = tables.length
  console.log(\`  [OK] \${tableCount} tables found in database\`)

  // Check for key DentWeb tables
  const keyTables = ['PATIENT', 'RECEIPT', 'TREAT_DETAIL', 'RESERVATION']
  const foundKeyTables = keyTables.filter(t => tables.includes(t))
  if (foundKeyTables.length > 0) {
    console.log(\`  [OK] DentWeb tables found: \${foundKeyTables.join(', ')}\`)
  }

  tables.forEach(t => logger.info(\`  \${t}\`))

  // Check key table columns
  const targetTables = ['PATIENT', 'RECEIPT', 'TREAT_DETAIL', 'RESERVATION']
  for (const tableName of targetTables) {
    if (tables.includes(tableName)) {
      logger.info(\`\\n--- \${tableName} columns ---\`)
      const columns = await listColumns(tableName)
      columns.forEach(c => logger.info(\`  \${c.name} (\${c.type})\`))
    }
  }

  await disconnectDB()

  console.log('')
  console.log('  ==========================================')
  console.log('  [OK] All checks passed!')
  console.log('  ==========================================')
  console.log('')

  logger.info('\\nTest complete!')
}

main().catch(error => {
  const msg = error instanceof Error ? error.message : String(error)
  logger.error('Error:', error)
  console.log('')
  console.log('  ==========================================')
  console.log(\`  [FAILED] Error: \${msg}\`)
  console.log('  ==========================================')
  console.log('')
  process.exit(1)
})
`

const STATUS_SERVER_TS = `import http from 'http'
import { config } from './config'
import { logger } from './logger'
import { loadState } from './state'

const STATUS_PORT = parseInt(process.env.STATUS_PORT || '52800', 10)

let agentStatus: Record<string, unknown> = {
  running: false,
  dbConnected: false,
  dbError: '',
  supabaseConnected: false,
  supabaseError: '',
  startedAt: '',
  lastSyncAt: '',
  lastSyncStatus: '',
  lastSyncPatientCount: 0,
  totalSyncs: 0,
  consecutiveErrors: 0,
  demoMode: false,
}

export function updateAgentStatus(updates: Record<string, unknown>): void {
  agentStatus = { ...agentStatus, ...updates }
}

export function getAgentStatus() {
  const state = loadState()
  return {
    ...agentStatus,
    lastSyncAt: state.lastSyncDate || agentStatus.lastSyncAt,
    lastSyncStatus: state.lastSyncStatus || agentStatus.lastSyncStatus,
    lastSyncPatientCount: state.lastSyncPatientCount || agentStatus.lastSyncPatientCount,
    totalSyncs: state.totalSyncs || agentStatus.totalSyncs,
    consecutiveErrors: state.consecutiveErrors || agentStatus.consecutiveErrors,
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatKoreanTime(isoStr: string): string {
  try { return new Date(isoStr).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) }
  catch { return isoStr }
}

function getUptime(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (diff < 60) return diff + '초'
  if (diff < 3600) return Math.floor(diff / 60) + '분 ' + (diff % 60) + '초'
  const hours = Math.floor(diff / 3600)
  const mins = Math.floor((diff % 3600) / 60)
  if (hours < 24) return hours + '시간 ' + mins + '분'
  return Math.floor(hours / 24) + '일 ' + (hours % 24) + '시간'
}

function formatStatusHtml(): string {
  const s = getAgentStatus() as Record<string, unknown>
  const uptime = s.startedAt ? getUptime(String(s.startedAt)) : '-'
  const dbOk = s.dbConnected as boolean
  const supaOk = s.supabaseConnected as boolean
  const syncStatus = String(s.lastSyncStatus || '')
  const running = s.running as boolean
  const demo = s.demoMode as boolean

  const lines: string[] = []
  lines.push('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="10">')
  lines.push('<title>덴트웹 브릿지 에이전트 상태</title>')
  lines.push('<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:#f0f2f5;color:#333}.container{max-width:600px;margin:40px auto;padding:0 20px}.header{background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;padding:24px;border-radius:12px 12px 0 0}.header h1{font-size:20px;margin-bottom:4px}.header .ver{font-size:13px;opacity:.8}.card{background:#fff;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:20px}.sr{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #eee}.sr:last-child{border-bottom:none}.label{font-size:14px;color:#666}.value{font-size:14px;font-weight:600}.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600}.ok{background:#e6f4ea;color:#1e8e3e}.err{background:#fce8e6;color:#d93025}.wait{background:#fef7e0;color:#f9a825}.demo-b{background:#e8f0fe;color:#1a73e8}.sec{margin-top:16px;padding-top:12px;border-top:2px solid #eee}.sec-t{font-size:13px;color:#999;text-transform:uppercase;margin-bottom:8px;letter-spacing:1px}.footer{text-align:center;padding:16px;font-size:12px;color:#999}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;animation:pulse 2s infinite}.dot.on{background:#1e8e3e}.dot.off{background:#d93025;animation:none}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style></head><body><div class="container">')
  lines.push('<div class="header"><h1>&#128737; 덴트웹 브릿지 에이전트</h1><div class="ver">v' + config.agentVersion + (demo ? ' (데모 모드)' : '') + '</div></div>')
  lines.push('<div class="card">')
  lines.push('<div class="sr"><span class="label">에이전트 상태</span><span class="value"><span class="dot ' + (running ? 'on' : 'off') + '"></span>' + (running ? '실행 중' : '중지됨') + '</span></div>')
  lines.push('<div class="sr"><span class="label">실행 시간</span><span class="value">' + uptime + '</span></div>')
  if (demo) lines.push('<div class="sr"><span class="label">모드</span><span class="badge demo-b">데모 모드</span></div>')
  lines.push('<div class="sec"><div class="sec-t">연결 상태</div></div>')
  lines.push('<div class="sr"><span class="label">덴트웹 DB</span><span class="value">' + (dbOk ? '&#9989; 연결됨' : (demo ? '&#9898; 건너뜀 (데모)' : '&#10060; 연결 실패' + (s.dbError ? ': ' + escapeHtml(String(s.dbError)) : ''))) + '</span></div>')
  lines.push('<div class="sr"><span class="label">Supabase API</span><span class="value">' + (supaOk ? '&#9989; 연결됨' : '&#10060; 연결 실패' + (s.supabaseError ? ': ' + escapeHtml(String(s.supabaseError)) : '')) + '</span></div>')
  lines.push('<div class="sec"><div class="sec-t">동기화</div></div>')
  lines.push('<div class="sr"><span class="label">마지막 동기화</span><span class="value">' + (s.lastSyncAt ? formatKoreanTime(String(s.lastSyncAt)) : '아직 없음') + '</span></div>')
  const syncBadge = syncStatus === 'success' ? 'ok' : (syncStatus === 'error' ? 'err' : 'wait')
  const syncLabel = syncStatus === 'success' ? '&#9989; 성공' : (syncStatus === 'error' ? '&#10060; 실패' : '&#9898; 대기 중')
  lines.push('<div class="sr"><span class="label">동기화 결과</span><span class="badge ' + syncBadge + '">' + syncLabel + '</span></div>')
  lines.push('<div class="sr"><span class="label">동기화된 환자 수</span><span class="value">' + s.lastSyncPatientCount + '명</span></div>')
  lines.push('<div class="sr"><span class="label">총 동기화 횟수</span><span class="value">' + s.totalSyncs + '회</span></div>')
  lines.push('<div class="sr"><span class="label">연속 오류</span><span class="value">' + s.consecutiveErrors + '회</span></div>')
  lines.push('<div class="sr"><span class="label">동기화 주기</span><span class="value">' + config.sync.intervalSeconds + '초</span></div>')
  lines.push('<div class="sec"><div class="sec-t">설정</div></div>')
  lines.push('<div class="sr"><span class="label">DB 서버</span><span class="value">' + escapeHtml(config.dentweb.server) + ':' + config.dentweb.port + '</span></div>')
  lines.push('<div class="sr"><span class="label">DB 이름</span><span class="value">' + escapeHtml(config.dentweb.database) + '</span></div>')
  lines.push('<div class="sr"><span class="label">인증 방식</span><span class="value">' + (config.dentweb.useWindowsAuth ? 'Windows (NTLM)' : 'SQL Server') + '</span></div>')
  lines.push('</div>')
  lines.push('<div class="footer">10초마다 자동 새로고침 | 시작: ' + (s.startedAt ? formatKoreanTime(String(s.startedAt)) : '-') + '</div>')
  lines.push('</div></body></html>')
  return lines.join('\\n')
}

export function startStatusServer(): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status' || req.url === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(getAgentStatus(), null, 2))
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(formatStatusHtml())
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn('상태 서버 포트 ' + STATUS_PORT + ' 이미 사용 중')
    } else {
      logger.warn('상태 서버 시작 실패:', err.message)
    }
  })

  server.listen(STATUS_PORT, '127.0.0.1', () => {
    logger.info('상태 페이지: http://localhost:' + STATUS_PORT)
    console.log('  [OK] 상태 페이지: http://localhost:' + STATUS_PORT)
    console.log('       (브라우저에서 에이전트 상태를 확인할 수 있습니다)')
  })
}
`

const RUN_BAT = `@echo off
chcp 65001 >nul 2>nul
title DentWeb Bridge Agent
cd /d "%~dp0"

:: Check build
if not exist "dist\\index.js" (
    echo [!] Build required. Running build...
    call npm run build
    if %errorLevel% neq 0 (
        echo [X] Build failed. Please run setup.bat first.
        pause
        exit /b 1
    )
)

:: Run agent
echo Starting DentWeb Bridge Agent...
echo.
node dist/index.js

:: Process ended
echo.
echo Agent has stopped.
pause
`

const INSTALL_SERVICE_JS = `// Windows 서비스로 등록하는 스크립트
// 관리자 권한으로 실행 필요: node scripts/install-service.js

const path = require('path')

try {
  const Service = require('node-windows').Service

  const svc = new Service({
    name: 'DentWeb Bridge Agent',
    description: '덴트웹 DB → Supabase 동기화 브릿지 에이전트',
    script: path.resolve(__dirname, '../dist/index.js'),
    nodeOptions: [],
    env: [{
      name: 'NODE_ENV',
      value: 'production'
    }]
  })

  svc.on('install', () => {
    console.log('서비스 설치 완료! 서비스를 시작합니다...')
    svc.start()
  })

  svc.on('start', () => {
    console.log('서비스가 시작되었습니다.')
    console.log('Windows 서비스 관리에서 "DentWeb Bridge Agent"를 확인하세요.')
  })

  svc.on('error', (err) => {
    console.error('서비스 오류:', err)
  })

  const args = process.argv.slice(2)

  if (args.includes('--uninstall')) {
    svc.on('uninstall', () => {
      console.log('서비스가 제거되었습니다.')
    })
    svc.uninstall()
  } else {
    svc.install()
  }
} catch (error) {
  console.error('node-windows 패키지가 필요합니다. npm install 후 다시 시도해주세요.')
  console.error(error)
}
`

const INSTALL_NODE_PS1 = `# Node.js LTS Auto-Install Script
# Tries multiple methods: winget -> direct MSI download -> chocolatey
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  Node.js LTS Auto-Install" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if already installed (refresh PATH first)
$nodePaths = @(
    "$env:ProgramFiles\\nodejs",
    "\${env:ProgramFiles(x86)}\\nodejs",
    "$env:LOCALAPPDATA\\Programs\\nodejs",
    "$env:APPDATA\\nvm\\current"
)
foreach ($np in $nodePaths) {
    if (Test-Path "$np\\node.exe") {
        $env:PATH = "$np;$env:PATH"
        Write-Host "  [OK] Node.js already installed at: $np" -ForegroundColor Green
        & "$np\\node.exe" -v
        exit 0
    }
}

# Refresh PATH from registry
$machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$env:PATH = "$machinePath;$userPath"

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck) {
    Write-Host "  [OK] Node.js found in PATH: \$(\$nodeCheck.Source)" -ForegroundColor Green
    node -v
    exit 0
}

$installed = $false

# ============================================
# Method 1: winget (Windows 10 1709+ / Windows 11)
# ============================================
Write-Host "  [1/3] Trying winget..." -ForegroundColor Yellow

$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
if ($wingetCmd) {
    try {
        Write-Host "  [*] Installing Node.js LTS via winget..."
        $wingetResult = & winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>&1
        $wingetExitCode = $LASTEXITCODE

        if ($wingetExitCode -eq 0 -or $wingetExitCode -eq -1978335189 -or ($wingetResult -match "successfully installed|already installed")) {
            Write-Host "  [OK] winget install completed" -ForegroundColor Green
            $installed = $true
        } else {
            Write-Host "  [!] winget install returned exit code: $wingetExitCode" -ForegroundColor Yellow
            Write-Host "       \$(\$wingetResult | Out-String)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [!] winget failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [!] winget not available on this system" -ForegroundColor Yellow
}

# ============================================
# Method 2: Direct MSI download and install
# ============================================
if (-not $installed) {
    Write-Host ""
    Write-Host "  [2/3] Trying direct MSI download..." -ForegroundColor Yellow

    $nodeVersion = $null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        $response = Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        if ($response.Content -match 'node-(v[\\d\\.]+)-x64\\.msi') {
            $nodeVersion = $Matches[1]
        }
    } catch {
        Write-Host "  [!] Could not detect latest version, using fallback" -ForegroundColor Yellow
    }

    $versions = @()
    if ($nodeVersion) { $versions += $nodeVersion }
    $versions += @("v22.14.0", "v20.18.3", "v20.11.1")

    $installerPath = "$env:TEMP\\node-installer.msi"
    $downloadSuccess = $false

    foreach ($ver in $versions) {
        $url = "https://nodejs.org/dist/$ver/node-$ver-x64.msi"
        Write-Host "  [*] Trying Node.js $ver..."
        Write-Host "       URL: $url"

        # Method 2a: System.Net.WebClient
        if (-not $downloadSuccess) {
            try {
                $webClient = New-Object System.Net.WebClient
                $webClient.Headers.Add("User-Agent", "DentWeb-Bridge-Agent-Setup")
                $webClient.DownloadFile($url, $installerPath)
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (WebClient)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] WebClient download failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
            } finally {
                if ($webClient) { $webClient.Dispose() }
            }
        }

        # Method 2b: Invoke-WebRequest
        if (-not $downloadSuccess) {
            try {
                Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 120
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (Invoke-WebRequest)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] Invoke-WebRequest failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        # Method 2c: curl.exe
        if (-not $downloadSuccess) {
            $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
            if ($curlCmd) {
                try {
                    & curl.exe -L -o $installerPath $url --silent --show-error --retry 2 --connect-timeout 30
                    if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                        $downloadSuccess = $true
                        Write-Host "  [OK] Download complete (curl)" -ForegroundColor Green
                    }
                } catch {
                    Write-Host "  [!] curl failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
                }
            }
        }

        # Method 2d: BitsTransfer
        if (-not $downloadSuccess) {
            try {
                Import-Module BitsTransfer -ErrorAction Stop
                Start-BitsTransfer -Source $url -Destination $installerPath -ErrorAction Stop
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (BitsTransfer)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] BitsTransfer failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        if ($downloadSuccess) { break }
    }

    if ($downloadSuccess) {
        Write-Host "  [*] Installing Node.js (silent mode)..."
        $msiProcess = Start-Process msiexec.exe -ArgumentList "/i", "\`"$installerPath\`"", "/qn", "/norestart", "ADDLOCAL=ALL" -Wait -NoNewWindow -PassThru
        if ($msiProcess.ExitCode -eq 0) {
            Write-Host "  [OK] MSI installation completed" -ForegroundColor Green
            $installed = $true
        } else {
            Write-Host "  [!] MSI install exit code: \$(\$msiProcess.ExitCode)" -ForegroundColor Yellow
            Write-Host "  [*] Retrying with basic UI..."
            $msiProcess2 = Start-Process msiexec.exe -ArgumentList "/i", "\`"$installerPath\`"", "/qb", "/norestart", "ADDLOCAL=ALL" -Wait -NoNewWindow -PassThru
            if ($msiProcess2.ExitCode -eq 0) {
                $installed = $true
                Write-Host "  [OK] MSI installation completed (with UI)" -ForegroundColor Green
            }
        }
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "  [!] All download attempts failed" -ForegroundColor Yellow
    }
}

# ============================================
# Method 3: Chocolatey (if available)
# ============================================
if (-not $installed) {
    Write-Host ""
    Write-Host "  [3/3] Trying Chocolatey..." -ForegroundColor Yellow

    $chocoCmd = Get-Command choco -ErrorAction SilentlyContinue
    if ($chocoCmd) {
        try {
            & choco install nodejs-lts -y --no-progress 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $installed = $true
                Write-Host "  [OK] Chocolatey install completed" -ForegroundColor Green
            }
        } catch {
            Write-Host "  [!] Chocolatey failed: \$(\$_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [!] Chocolatey not available" -ForegroundColor Yellow
    }
}

# ============================================
# Verify installation
# ============================================
Write-Host ""

if ($installed) {
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"

    foreach ($np in $nodePaths) {
        if ((Test-Path "$np\\node.exe") -and ($env:PATH -notlike "*$np*")) {
            $env:PATH = "$np;$env:PATH"
        }
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeVer = & node -v 2>&1
        Write-Host "  ==========================================" -ForegroundColor Green
        Write-Host "  [OK] Node.js installed successfully!" -ForegroundColor Green
        Write-Host "       Version: $nodeVer" -ForegroundColor Green
        Write-Host "       Path: \$(\$nodeCmd.Source)" -ForegroundColor Green
        Write-Host "  ==========================================" -ForegroundColor Green
        exit 0
    } else {
        $nodePath = "$env:ProgramFiles\\nodejs"
        if (Test-Path "$nodePath\\node.exe") {
            [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$nodePath", "Machine")
            $env:PATH = "$nodePath;$env:PATH"
            $nodeVer = & "$nodePath\\node.exe" -v 2>&1
            Write-Host "  ==========================================" -ForegroundColor Green
            Write-Host "  [OK] Node.js installed successfully!" -ForegroundColor Green
            Write-Host "       Version: $nodeVer" -ForegroundColor Green
            Write-Host "       Path: $nodePath" -ForegroundColor Green
            Write-Host "  ==========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "  NOTE: You may need to restart this terminal" -ForegroundColor Yellow
            Write-Host "        for PATH changes to take effect." -ForegroundColor Yellow
            exit 0
        }
    }
}

Write-Host "  ==========================================" -ForegroundColor Red
Write-Host "  [FAILED] Node.js installation failed" -ForegroundColor Red
Write-Host "  ==========================================" -ForegroundColor Red
Write-Host ""
Write-Host "  Please install Node.js manually:" -ForegroundColor Yellow
Write-Host "    1. Go to https://nodejs.org" -ForegroundColor White
Write-Host "    2. Download LTS version" -ForegroundColor White
Write-Host "    3. Run the installer" -ForegroundColor White
Write-Host "    4. Run setup.bat again" -ForegroundColor White
Write-Host ""
exit 1
`
