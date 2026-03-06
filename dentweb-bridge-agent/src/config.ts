import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

export const config = {
  // 덴트웹 DB 설정
  dentweb: {
    server: process.env.DENTWEB_DB_SERVER || 'localhost',
    port: parseInt(process.env.DENTWEB_DB_PORT || '1433', 10),
    database: process.env.DENTWEB_DB_DATABASE || 'DENTWEBDB',
    user: process.env.DENTWEB_DB_USER || '',
    password: process.env.DENTWEB_DB_PASSWORD || '',
    dbPath: process.env.DENTWEB_DB_PATH || 'c:\\DENTWEBDB',
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

  // 에이전트 버전
  agentVersion: '1.0.0',
}

export function validateConfig(): string[] {
  const errors: string[] = []

  // Windows 인증이 아닌 경우에만 user/password 필수
  if (!config.dentweb.useWindowsAuth) {
    if (!config.dentweb.user) errors.push('DENTWEB_DB_USER is required (or use Windows auth)')
    if (!config.dentweb.password) errors.push('DENTWEB_DB_PASSWORD is required (or use Windows auth)')
  }
  if (!config.supabase.url) errors.push('SUPABASE_URL is required')
  if (!config.supabase.clinicId) errors.push('CLINIC_ID is required')
  if (!config.supabase.apiKey) errors.push('API_KEY is required')

  return errors
}
