/**
 * 홈택스 스크래핑 워커 감시자 (Watchdog)
 *
 * 역할:
 *  - Mac mini에서 pm2로 상시 실행 (pm2 start --name scraping-watchdog -- npm run watchdog)
 *  - DB worker_control 테이블을 10초마다 폴링
 *  - start_requested = true 감지 시 → 워커 프로세스 자동 시작
 *  - 워커 프로세스 상태를 DB에 주기적으로 기록 (watchdog_online, worker_running)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const POLL_INTERVAL_MS = 10_000; // 10초마다 폴링
const CONTROL_ID = 'main';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let workerProcess: ChildProcess | null = null;

function isWorkerRunning(): boolean {
  return workerProcess !== null && workerProcess.exitCode === null;
}

function startWorker(): void {
  if (isWorkerRunning()) {
    console.log('[Watchdog] 워커가 이미 실행 중입니다.');
    return;
  }

  const workerDir = join(__dirname, '..');
  console.log(`[Watchdog] 워커 시작: ${workerDir}`);

  workerProcess = spawn('npm', ['start'], {
    cwd: workerDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  workerProcess.on('exit', (code, signal) => {
    console.log(`[Watchdog] 워커 종료 (code: ${code}, signal: ${signal})`);
    workerProcess = null;
    updateStatus().catch(console.error);
  });

  workerProcess.on('error', (err) => {
    console.error('[Watchdog] 워커 시작 오류:', err);
    workerProcess = null;
  });
}

async function ensureControlRow(): Promise<void> {
  const { error } = await supabase
    .from('worker_control')
    .upsert({ id: CONTROL_ID }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('[Watchdog] ensureControlRow 오류:', error.message);
}

async function updateStatus(): Promise<void> {
  const { error } = await supabase
    .from('worker_control')
    .update({
      watchdog_online: true,
      worker_running: isWorkerRunning(),
      last_updated: new Date().toISOString(),
    })
    .eq('id', CONTROL_ID);
  if (error) console.warn('[Watchdog] 상태 업데이트 오류:', error.message);
}

async function poll(): Promise<void> {
  const { data, error } = await supabase
    .from('worker_control')
    .select('start_requested')
    .eq('id', CONTROL_ID)
    .single();

  if (error) {
    console.warn('[Watchdog] 폴링 오류:', error.message);
    return;
  }

  if (data?.start_requested) {
    // 플래그 즉시 초기화
    await supabase
      .from('worker_control')
      .update({ start_requested: false })
      .eq('id', CONTROL_ID);

    startWorker();
    return;
  }

  // 워커가 실행 중이 아닌데 pending job이 있으면 자동 시작 (자가 복구)
  if (!isWorkerRunning()) {
    const { data: pendingJob } = await supabase
      .from('scraping_jobs')
      .select('id')
      .in('status', ['pending', 'running'])
      .limit(1)
      .single();

    if (pendingJob) {
      console.log('[Watchdog] 미처리 Job 감지, 워커 자동 시작');
      startWorker();
    }
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Watchdog] ${signal} 수신, 종료 중...`);
  await supabase
    .from('worker_control')
    .update({ watchdog_online: false, worker_running: false, last_updated: new Date().toISOString() })
    .eq('id', CONTROL_ID);

  if (workerProcess) {
    workerProcess.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main(): Promise<void> {
  console.log('[Watchdog] 홈택스 스크래핑 워커 감시자 시작');

  await ensureControlRow();
  await updateStatus();
  console.log('[Watchdog] DB 등록 완료, 폴링 시작 (10초 간격)');

  setInterval(async () => {
    try {
      await poll();
      await updateStatus();
    } catch (err) {
      console.error('[Watchdog] 폴링 루프 오류:', err);
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[Watchdog] 시작 실패:', err);
  process.exit(1);
});
