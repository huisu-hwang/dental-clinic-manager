import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
    }
    return value;
}
export const config = {
    // Supabase
    supabase: {
        url: requireEnv('SUPABASE_URL'),
        serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
    // 암호화
    encryptionKey: requireEnv('ENCRYPTION_KEY'),
    // 워커
    worker: {
        id: process.env.WORKER_ID || `worker-${Date.now()}`,
        pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10),
        heartbeatIntervalMs: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000', 10),
        maxConcurrent: parseInt(process.env.WORKER_MAX_CONCURRENT || '3', 10),
    },
    // 스크래핑 모드: 'playwright' (기본, 브라우저) | 'protocol' (HTTP 직접 호출)
    scrapingMode: (process.env.SCRAPING_MODE || 'playwright'),
    // Playwright (scrapingMode=playwright일 때만 사용)
    playwright: {
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        timeoutMs: parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
    },
    // Protocol (scrapingMode=protocol일 때만 사용)
    protocol: {
        timeoutMs: parseInt(process.env.PROTOCOL_TIMEOUT_MS || '30000', 10),
        userAgent: process.env.PROTOCOL_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    // 배치 스케줄
    schedule: {
        dailySyncCron: process.env.DAILY_SYNC_CRON || '0 7 * * *',
        monthlySettlementCron: process.env.MONTHLY_SETTLEMENT_CRON || '0 8 1 * *',
        clinicIntervalMinutes: parseInt(process.env.CLINIC_INTERVAL_MINUTES || '5', 10),
    },
    // 로깅
    logLevel: process.env.LOG_LEVEL || 'info',
};
//# sourceMappingURL=config.js.map