import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
  }
  return value;
}

export const config = {
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  worker: {
    id: process.env.WORKER_ID || `seo-worker-${Date.now()}`,
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10),
    heartbeatIntervalMs: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000', 10),
  },

  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    timeoutMs: parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
} as const;
