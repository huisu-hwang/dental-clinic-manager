import { config } from './config.js';
import { createChildLogger } from './utils/logger.js';
import { testConnection, registerWorker, deregisterWorker, updateHeartbeat } from './db/supabaseClient.js';
import { startPolling } from './queue/jobConsumer.js';
import { processScrapingJob } from './hometax/jobProcessor.js';
import { closeBrowser } from './browser/browserManager.js';
import { startDailySync } from './scheduler/dailySync.js';
import { startMonthlySettlement } from './scheduler/monthlySettlement.js';

const log = createChildLogger('main');

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Heartbeat 주기적 전송 시작 */
function startHeartbeat(): void {
  heartbeatTimer = setInterval(async () => {
    try {
      const stopRequested = await updateHeartbeat('idle');
      if (stopRequested) {
        log.info('DB에서 중지 요청 수신 (stop_requested=true), graceful shutdown 시작');
        shutdown('stop_requested');
      }
    } catch (err) {
      log.warn({ err }, 'Heartbeat 전송 실패');
    }
  }, config.worker.heartbeatIntervalMs);
}

/** Graceful shutdown 처리 */
async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, '종료 시그널 수신, graceful shutdown 시작');

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await closeBrowser();
    await deregisterWorker();
    log.info('워커 해제 완료');
  } catch (err) {
    log.error({ err }, '워커 해제 중 오류');
  }

  process.exit(0);
}

/** worker_control.disabled 플래그 체크 — true이면 즉시 종료 */
async function checkDisabledFlag(): Promise<boolean> {
  try {
    const { getSupabaseClient } = await import('./db/supabaseClient.js');
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('worker_control')
      .select('disabled')
      .eq('id', 'main')
      .single();
    return data?.disabled === true;
  } catch (err) {
    log.warn({ err }, 'disabled 플래그 조회 실패 — 정상 진행');
    return false;
  }
}

/** 메인 엔트리 포인트 */
async function main(): Promise<void> {
  log.info({
    workerId: config.worker.id,
    pollInterval: config.worker.pollIntervalMs,
    heartbeatInterval: config.worker.heartbeatIntervalMs,
    maxConcurrent: config.worker.maxConcurrent,
  }, '홈택스 스크래핑 워커 시작');

  // 0. 비활성화 플래그 체크 (사용자 PC marketing-worker로 이전된 경우)
  if (await checkDisabledFlag()) {
    log.warn('worker_control.disabled=true → 즉시 종료 (PM2가 max_restarts 후 stopped 상태로 전환)');
    process.exit(0);
  }

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

  // 4. Graceful shutdown 핸들러 등록
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 5. 스케줄러 시작 (일일 배치 + 월말 결산)
  startDailySync();
  startMonthlySettlement();

  // 6. Job 폴링 시작
  await startPolling(processScrapingJob);
}

main().catch((err) => {
  log.fatal({ err }, '워커 시작 실패');
  process.exit(1);
});
