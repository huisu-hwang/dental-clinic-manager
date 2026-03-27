import { config } from './config.js';
import { createChildLogger } from './utils/logger.js';
import { testConnection, registerWorker, deregisterWorker, updateHeartbeat } from './db/supabaseClient.js';
import { startPolling } from './queue/jobConsumer.js';
import { processSeoJob } from './analyzer/jobProcessor.js';
import { closeBrowser } from './analyzer/browserManager.js';

const log = createChildLogger('main');

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  heartbeatTimer = setInterval(async () => {
    try {
      const stopRequested = await updateHeartbeat('online');
      if (stopRequested) {
        log.info('DB에서 중지 요청 수신 (stop_requested=true), graceful shutdown 시작');
        shutdown('stop_requested');
      }
    } catch (err) {
      log.warn({ err }, 'Heartbeat 전송 실패');
    }
  }, config.worker.heartbeatIntervalMs);
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, '종료 시그널 수신, graceful shutdown 시작');

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await closeBrowser();
    await deregisterWorker();
    log.info('SEO 워커 해제 완료');
  } catch (err) {
    log.error({ err }, '워커 해제 중 오류');
  }

  process.exit(0);
}

async function main(): Promise<void> {
  log.info({
    workerId: config.worker.id,
    pollInterval: config.worker.pollIntervalMs,
    heartbeatInterval: config.worker.heartbeatIntervalMs,
  }, 'SEO 분석 워커 시작');

  // 1. Supabase 연결 테스트
  const connected = await testConnection();
  if (!connected) {
    log.fatal('Supabase 연결 실패, 워커 종료');
    process.exit(1);
  }

  // 2. 워커 등록
  await registerWorker();

  // 3. Heartbeat 시작
  startHeartbeat();

  // 4. Graceful shutdown 핸들러
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 5. Job 폴링 시작
  await startPolling(processSeoJob);
}

main().catch((err) => {
  log.fatal({ err }, 'SEO 워커 시작 실패');
  process.exit(1);
});
