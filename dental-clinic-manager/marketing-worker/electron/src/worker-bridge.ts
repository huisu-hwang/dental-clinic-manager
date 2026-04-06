import { app } from 'electron';
import { getConfig, getWorkerEnvVars } from './config-store';
import { log } from './logger';
import { notifyPublishSuccess, notifyPublishError } from './tray';
import { checkForUpdatesManually } from './updater';

// ============================================
// 워커 연결 어댑터 + Supervisor 통합
// - Supervisor 기능: 10초 간격 제어 신호 폴링 + 상태 업데이트
// - Scheduler 기능: 5분 간격 발행 대상 확인 + 즉시 트리거 대응
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
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let controlPollTimer: ReturnType<typeof setInterval> | null = null;
let isPublishing = false; // 발행 중 중복 실행 방지
const statusCallbacks: StatusChangeCallback[] = [];
const publishCallbacks: PublishResultCallback[] = [];

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5분 - 정기 폴링
const CONTROL_POLL_INTERVAL_MS = 10 * 1000;   // 10초 - 제어 신호 폴링

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
 * 대시보드 API 호출 헬퍼
 */
async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.dashboardUrl}/api/marketing/worker-api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.workerApiKey}`,
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * 제어 행 초기화 + 워커 상태 업데이트 (온라인 등록)
 */
async function registerWorkerOnline(): Promise<void> {
  try {
    await apiRequest('/init', { method: 'POST', body: '{}' });
    await apiRequest('/control', {
      method: 'PATCH',
      body: JSON.stringify({
        watchdog_online: true,
        worker_running: true,
        worker_version: app.getVersion(),
      }),
    });
    log('info', `[WorkerBridge] 워커 온라인 상태 등록 완료 (v${app.getVersion()})`);
  } catch (err) {
    log('warn', `[WorkerBridge] 온라인 등록 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 워커 오프라인 상태 업데이트
 */
async function registerWorkerOffline(): Promise<void> {
  try {
    await apiRequest('/control', {
      method: 'PATCH',
      body: JSON.stringify({
        watchdog_online: false,
        worker_running: false,
      }),
    });
    log('info', '[WorkerBridge] 워커 오프라인 상태 등록');
  } catch (err) {
    log('warn', `[WorkerBridge] 오프라인 등록 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 제어 신호 폴링 (10초 간격)
 * - start_requested 감지 → 즉시 발행 실행
 * - stop_requested 감지 → 워커 중지
 * - watchdog_online 상태 주기적 업데이트
 */
async function pollControlSignals(): Promise<void> {
  try {
    const result = await apiRequest<{
      control: {
        start_requested: boolean;
        stop_requested: boolean;
        headless: boolean;
        update_requested: boolean;
      };
      nextItem: unknown;
    }>('/poll');

    // watchdog 상태 갱신 (heartbeat + 버전)
    await apiRequest('/control', {
      method: 'PATCH',
      body: JSON.stringify({
        watchdog_online: true,
        worker_running: currentStatus === 'running',
        worker_version: app.getVersion(),
      }),
    });

    // start_requested 감지 → 즉시 발행
    if (result.control.start_requested) {
      log('info', '[WorkerBridge] start_requested 신호 감지 → 즉시 발행 트리거');
      // 신호 클리어 먼저
      await apiRequest('/control', {
        method: 'PATCH',
        body: JSON.stringify({ clear_start_requested: true }),
      });
      // 발행 실행 (비동기, 중복 방지)
      if (!isPublishing) {
        runSchedulerOnce().catch(err => {
          log('error', `[WorkerBridge] 즉시 발행 오류: ${err instanceof Error ? err.message : String(err)}`);
        });
      } else {
        log('info', '[WorkerBridge] 이미 발행 진행 중 - 트리거 무시');
      }
    }

    // stop_requested 감지 → 중지
    if (result.control.stop_requested) {
      log('info', '[WorkerBridge] stop_requested 신호 감지 → 워커 중지');
      await apiRequest('/control', {
        method: 'PATCH',
        body: JSON.stringify({ clear_stop_requested: true }),
      });
      stop();
    }

    // update_requested 감지 → 업데이트 확인
    if (result.control.update_requested) {
      log('info', '[WorkerBridge] update_requested 신호 감지 → 업데이트 확인');
      await apiRequest('/control', {
        method: 'PATCH',
        body: JSON.stringify({ clear_update_requested: true }),
      });
      checkForUpdatesManually();
    }
  } catch (err) {
    log('warn', `[WorkerBridge] 제어 폴링 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
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
 * esbuild로 CJS 번들된 scheduler-bundle.js를 로드
 * (marketing-worker는 ESM이므로 require로 직접 로드 불가 → esbuild CJS 번들 사용)
 */
async function runSchedulerOnce(): Promise<void> {
  if (isPublishing) {
    log('info', '[WorkerBridge] 이미 발행 진행 중 - 건너뜀');
    return;
  }
  isPublishing = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const scheduler = require('./scheduler-bundle.js') as SchedulerModule;
    await scheduler.processScheduledItemsOnce();
    notifyResult({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[WorkerBridge] 스케줄러 실행 오류: ${msg}`);
    notifyResult({ success: false, error: msg });
  } finally {
    isPublishing = false;
  }
}

/**
 * 워커 시작 (즉시 1회 + 5분 스케줄러 + 10초 제어 폴링)
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
  log('info', '[WorkerBridge] 워커 시작 (Supervisor 통합 모드)');

  // 1. 워커 온라인 등록 (DB 상태 업데이트)
  await registerWorkerOnline();

  // 2. 즉시 1회 발행 체크
  await runSchedulerOnce();

  // 3. 10초 간격 제어 신호 폴링 (supervisor 기능)
  controlPollTimer = setInterval(async () => {
    if (currentStatus !== 'running') return;
    await pollControlSignals();
  }, CONTROL_POLL_INTERVAL_MS);

  // 4. 5분 간격 정기 발행 체크 (scheduler 기능)
  schedulerTimer = setInterval(async () => {
    if (currentStatus !== 'running') return;
    await runSchedulerOnce();
  }, SCHEDULER_INTERVAL_MS);
}

/**
 * 워커 중지
 */
export async function stop(): Promise<void> {
  if (controlPollTimer !== null) {
    clearInterval(controlPollTimer);
    controlPollTimer = null;
  }
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  // 오프라인 상태 등록
  await registerWorkerOffline();

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
