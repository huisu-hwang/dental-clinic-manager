/**
 * 마케팅 워커 감시자 (Supervisor/Watchdog)
 *
 * 역할:
 *  - Mac mini에서 pm2로 상시 실행
 *  - DB marketing_worker_control 테이블을 10초마다 폴링
 *  - start_requested = true 감지 시 → 워커 프로세스 자동 시작
 *  - stop_requested = true 감지 시 → 워커 프로세스 중지
 *  - 워커 프로세스 상태를 DB에 주기적으로 기록
 *
 * 실행:
 *  pm2 start --name marketing-supervisor -- npm run supervisor
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1순위: 자기 디렉토리, 2순위: 부모 디렉토리
import { existsSync } from 'fs';
const localEnv = resolve(__dirname, '.env.local');
const parentEnv = resolve(__dirname, '..', '.env.local');
dotenv.config({ path: existsSync(localEnv) ? localEnv : parentEnv });

const POLL_INTERVAL_MS = 10_000; // 10초마다 폴링
const CONTROL_ID = 'main';

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let workerProcess: ChildProcess | null = null;

function isWorkerRunning(): boolean {
  return workerProcess !== null && workerProcess.exitCode === null;
}

function startWorker(): void {
  if (isWorkerRunning()) {
    console.log('[Supervisor] 워커가 이미 실행 중입니다.');
    return;
  }

  const workerDir = __dirname;
  console.log(`[Supervisor] 워커 시작: ${workerDir}`);

  workerProcess = spawn('npm', ['start'], {
    cwd: workerDir,
    stdio: 'inherit',
    env: { ...process.env },
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

async function ensureControlRow(): Promise<void> {
  const { error } = await supabase
    .from('marketing_worker_control')
    .upsert({ id: CONTROL_ID }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('[Supervisor] ensureControlRow 오류:', error.message);
}

async function updateStatus(): Promise<void> {
  const { error } = await supabase
    .from('marketing_worker_control')
    .update({
      watchdog_online: true,
      worker_running: isWorkerRunning(),
      last_updated: new Date().toISOString(),
    })
    .eq('id', CONTROL_ID);
  if (error) console.warn('[Supervisor] 상태 업데이트 오류:', error.message);
}

async function poll(): Promise<void> {
  const { data, error } = await supabase
    .from('marketing_worker_control')
    .select('start_requested, stop_requested')
    .eq('id', CONTROL_ID)
    .single();

  if (error) {
    console.warn('[Supervisor] 폴링 오류:', error.message);
    return;
  }

  // 시작 요청 처리
  if (data?.start_requested) {
    await supabase
      .from('marketing_worker_control')
      .update({ start_requested: false })
      .eq('id', CONTROL_ID);

    startWorker();
  }

  // 중지 요청 처리
  if (data?.stop_requested) {
    await supabase
      .from('marketing_worker_control')
      .update({ stop_requested: false })
      .eq('id', CONTROL_ID);

    stopWorker();
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Supervisor] ${signal} 수신, 종료 중...`);
  await supabase
    .from('marketing_worker_control')
    .update({
      watchdog_online: false,
      worker_running: false,
      last_updated: new Date().toISOString(),
    })
    .eq('id', CONTROL_ID);

  if (workerProcess) {
    workerProcess.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log('[Supervisor] 마케팅 워커 감시자 시작');
  console.log('[Supervisor] 폴링 간격: 10초');
  console.log('='.repeat(50));

  await ensureControlRow();
  await updateStatus();
  console.log('[Supervisor] DB 등록 완료, 폴링 시작');

  setInterval(async () => {
    try {
      await poll();
      await updateStatus();
    } catch (err) {
      console.error('[Supervisor] 폴링 루프 오류:', err);
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[Supervisor] 시작 실패:', err);
  process.exit(1);
});
