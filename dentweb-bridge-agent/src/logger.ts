import fs from 'fs'
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
  const logLine = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`

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
    fs.appendFileSync(LOG_FILE, logLine + '\n')
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
