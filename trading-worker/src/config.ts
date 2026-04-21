/**
 * 환경변수 검증 및 설정
 */

export interface WorkerConfig {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  encryptionKey: string
  telegramBotToken: string
  workerSecretKey: string
  nodeEnv: string
}

export function loadConfig(): WorkerConfig {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
    'TELEGRAM_BOT_TOKEN',
    'WORKER_SECRET_KEY',
  ]

  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`필수 환경변수 누락: ${missing.join(', ')}`)
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    encryptionKey: process.env.ENCRYPTION_KEY!,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
    workerSecretKey: process.env.WORKER_SECRET_KEY!,
    nodeEnv: process.env.NODE_ENV || 'development',
  }
}
