import { getConfig, getWorkerEnvVars } from './config-store';
import { log } from './logger';
import { notifyPublishSuccess, notifyPublishError } from './tray';

// ============================================
// 워커 연결 어댑터
// 기존 marketing-worker 코드를 Electron에서 실행하는 어댑터
// config-store 설정을 환경변수로 주입 후 기존 scheduler를 직접 호출
// ============================================

export type WorkerStatus = 'running' | 'stopped' | 'error';

export interface PublishResult {
  success: boolean;
  title?: string;
  platform?: string;
  url?: string;
  error?: string;
}

type StatusChangeCallback = (status: WorkerStatus, message?: string) => void;
type PublishResultCallback = (result: PublishResult) => void;

let currentStatus: WorkerStatus = 'stopped';
let pollTimer: ReturnType<typeof setInterval> | null = null;
const statusCallbacks: StatusChangeCallback[] = [];
const publishCallbacks: PublishResultCallback[] = [];

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분

function setStatus(status: WorkerStatus, message?: string): void {
  currentStatus = status;
  statusCallbacks.forEach(cb => cb(status, message));
}

function notifyResult(result: PublishResult): void {
  publishCallbacks.forEach(cb => cb(result));
  // 트레이 Notification
  if (result.success) {
    notifyPublishSuccess(result.title || '게시물', result.url);
  } else {
    notifyPublishError(result.title || '게시물', result.error);
  }
}

/**
 * config-store 값을 process.env로 주입
 */
function applyEnvVars(): void {
  const envVars = getWorkerEnvVars();
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }
  log('info', `[WorkerBridge] 환경변수 주입: DASHBOARD_API_URL=${process.env.DASHBOARD_API_URL}`);
}

/**
 * 스케줄러 모듈 타입 (기존 marketing-worker/scheduler.ts의 내보내기)
 */
interface SchedulerModule {
  processScheduledItemsOnce(): Promise<void>;
  stopScheduler(): Promise<void>;
}

/**
 * 스케줄러 1회 실행
 * 기존 marketing-worker/scheduler.ts의 processScheduledItemsOnce 호출
 * 기존 파일은 ESM이므로 Function constructor 없이 require로 로드
 * (Electron main은 CommonJS로 빌드, marketing-worker는 별도 ESM 번들)
 */
async function runSchedulerOnce(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scheduler = require('../../dist/scheduler.js') as SchedulerModule;
    await scheduler.processScheduledItemsOnce();
    notifyResult({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[WorkerBridge] 스케줄러 실행 오류: ${msg}`);
    notifyResult({ success: false, error: msg });
  }
}

let scrapingStarted = false;
async function toggleScrapingWorker(start: boolean): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scraping = require('../../dist/scraping/index.js');
    if (start && !scrapingStarted) {
      await scraping.startScrapingWorker();
      scrapingStarted = true;
    } else if (!start && scrapingStarted) {
      await scraping.stopScrapingWorker();
      scrapingStarted = false;
    }
  } catch (err) {
    log('error', `[WorkerBridge] 스크래핑 워커 ${start ? '시작' : '종료'} 오류: ${err}`);
  }
}

/**
 * 워커 시작 (즉시 1회 + 5분 간격 폴링)
 */
export async function start(): Promise<void> {
  if (currentStatus === 'running') {
    log('warn', '[WorkerBridge] 이미 실행 중');
    return;
  }

  const cfg = getConfig();
  if (!cfg.dashboardUrl || !cfg.workerApiKey) {
    log('error', '[WorkerBridge] 설정 미완료: dashboardUrl 또는 workerApiKey 없음');
    setStatus('error', '설정 미완료');
    return;
  }

  applyEnvVars();
  setStatus('running');
  log('info', '[WorkerBridge] 워커 시작');

  // 즉시 1회 실행
  await runSchedulerOnce();

  // 스크래핑 워커 시작
  await toggleScrapingWorker(true);

  // 5분 간격 반복
  pollTimer = setInterval(async () => {
    if (currentStatus !== 'running') return;
    await runSchedulerOnce();
  }, POLL_INTERVAL_MS);
}

/**
 * 워커 중지
 */
export async function stop(): Promise<void> {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  await toggleScrapingWorker(false);
  setStatus('stopped');
  log('info', '[WorkerBridge] 워커 중지');
}

/**
 * 현재 상태 반환
 */
export function getStatus(): WorkerStatus {
  return currentStatus;
}

/**
 * 상태 변경 콜백 등록
 */
export function onStatusChange(callback: StatusChangeCallback): void {
  statusCallbacks.push(callback);
}

/**
 * 발행 결과 콜백 등록
 */
export function onPublishResult(callback: PublishResultCallback): void {
  publishCallbacks.push(callback);
}
