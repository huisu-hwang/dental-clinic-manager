/**
 * 마케팅 워커 감시자 (Supervisor/Watchdog)
 *
 * API 모드: 대시보드 API를 통해 제어 신호 수신 (Supabase 키 불필요)
 * 레거시 모드: Supabase 직접 접속 (하위 호환)
 */

import { spawn, ChildProcess } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG, isApiMode } from './config.js';
import { WorkerApiClient } from './api-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const POLL_INTERVAL_MS = 10_000; // 10초마다 폴링

let workerProcess: ChildProcess | null = null;
let apiClient: WorkerApiClient | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any = null;

function getApiClient(): WorkerApiClient {
  if (!apiClient) {
    apiClient = new WorkerApiClient(CONFIG.api.dashboardUrl, CONFIG.api.workerApiKey);
  }
  return apiClient;
}

async function getSupabase() {
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);
  }
  return supabase;
}

function isWorkerRunning(): boolean {
  return workerProcess !== null && workerProcess.exitCode === null;
}

function startWorker(): void {
  if (isWorkerRunning()) {
    console.log('[Supervisor] 워커가 이미 실행 중입니다.');
    return;
  }

  console.log(`[Supervisor] 워커 시작: ${__dirname}`);

  workerProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
    shell: true, // Windows에서 npm.cmd 호출을 위해 필요
  });

  workerProcess.on('exit', (code, signal) => {
    console.log(`[Supervisor] 워커 종료 (code: ${code}, signal: ${signal})`);
    workerProcess = null;
    updateStatus().catch(console.error);
  });

  workerProcess.on('error', (err) => {
    console.error('[Supervisor] 워커 시작 오류:', err);
    workerProcess = null;
  });
}

function stopWorker(): void {
  if (!isWorkerRunning() || !workerProcess) {
    console.log('[Supervisor] 워커가 실행 중이 아닙니다.');
    return;
  }

  console.log('[Supervisor] 워커 중지 요청');
  workerProcess.kill('SIGTERM');
}

// ─── API 모드 ───

async function initApi(): Promise<void> {
  const client = getApiClient();
  await client.initControl();
}

async function updateStatusApi(): Promise<void> {
  const client = getApiClient();
  await client.updateControl({
    watchdog_online: true,
    worker_running: isWorkerRunning(),
  });
}

async function pollApi(): Promise<void> {
  const client = getApiClient();
  const { control } = await client.poll();

  if (control.start_requested) {
    await client.updateControl({ clear_start_requested: true });
    startWorker();
  }

  if (control.stop_requested) {
    await client.updateControl({ clear_stop_requested: true });
    stopWorker();
  }
}

async function shutdownApi(): Promise<void> {
  const client = getApiClient();
  await client.updateControl({
    watchdog_online: false,
    worker_running: false,
  });
}

// ─── 레거시 모드 (Supabase 직접 접속) ───

const CONTROL_ID = 'main';

async function initSupabase(): Promise<void> {
  const sb = await getSupabase();
  await sb.from('marketing_worker_control')
    .upsert({ id: CONTROL_ID }, { onConflict: 'id', ignoreDuplicates: true });
}

async function updateStatusSupabase(): Promise<void> {
  const sb = await getSupabase();
  await sb.from('marketing_worker_control')
    .update({
      watchdog_online: true,
      worker_running: isWorkerRunning(),
      last_updated: new Date().toISOString(),
    })
    .eq('id', CONTROL_ID);
}

async function pollSupabase(): Promise<void> {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('marketing_worker_control')
    .select('start_requested, stop_requested')
    .eq('id', CONTROL_ID)
    .single();

  if (error) {
    console.warn('[Supervisor] 폴링 오류:', error.message);
    return;
  }

  if (data?.start_requested) {
    await sb.from('marketing_worker_control')
      .update({ start_requested: false }).eq('id', CONTROL_ID);
    startWorker();
  }

  if (data?.stop_requested) {
    await sb.from('marketing_worker_control')
      .update({ stop_requested: false }).eq('id', CONTROL_ID);
    stopWorker();
  }
}

async function shutdownSupabase(): Promise<void> {
  const sb = await getSupabase();
  await sb.from('marketing_worker_control')
    .update({
      watchdog_online: false,
      worker_running: false,
      last_updated: new Date().toISOString(),
    })
    .eq('id', CONTROL_ID);
}

// ─── 공통 ───

async function updateStatus(): Promise<void> {
  if (isApiMode()) await updateStatusApi();
  else await updateStatusSupabase();
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Supervisor] ${signal} 수신, 종료 중...`);
  try {
    if (isApiMode()) await shutdownApi();
    else await shutdownSupabase();
  } catch { /* ignore */ }

  if (workerProcess) workerProcess.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main(): Promise<void> {
  const mode = isApiMode() ? 'API' : '레거시 (Supabase 직접)';
  console.log('='.repeat(50));
  console.log('[Supervisor] 마케팅 워커 감시자 시작');
  console.log(`[Supervisor] 모드: ${mode}`);
  console.log('[Supervisor] 폴링 간격: 10초');
  console.log('='.repeat(50));

  if (isApiMode()) {
    await initApi();
    await updateStatusApi();
  } else {
    await initSupabase();
    await updateStatusSupabase();
  }

  console.log('[Supervisor] 등록 완료, 폴링 시작');

  setInterval(async () => {
    try {
      if (isApiMode()) {
        await pollApi();
        await updateStatusApi();
      } else {
        await pollSupabase();
        await updateStatusSupabase();
      }
    } catch (err) {
      console.error('[Supervisor] 폴링 루프 오류:', err);
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[Supervisor] 시작 실패:', err);
  process.exit(1);
});
