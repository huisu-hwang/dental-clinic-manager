import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('supabase');

let client: SupabaseClient | null = null;
let workerId: string | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    log.info('Supabase 클라이언트 초기화 완료');
  }
  return client;
}

export function getWorkerId(): string | null {
  return workerId;
}

export async function testConnection(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('seo_workers')
      .select('id')
      .limit(1);

    if (error) {
      log.error({ error }, 'Supabase 연결 테스트 실패');
      return false;
    }

    log.info('Supabase 연결 테스트 성공');
    return true;
  } catch (err) {
    log.error({ err }, 'Supabase 연결 테스트 예외');
    return false;
  }
}

export async function registerWorker(): Promise<void> {
  const supabase = getSupabaseClient();
  const workerName = config.worker.id;

  const { data, error } = await supabase
    .from('seo_workers')
    .upsert({
      worker_name: workerName,
      status: 'online',
      stop_requested: false,
      last_heartbeat: new Date().toISOString(),
      started_at: new Date().toISOString(),
    }, { onConflict: 'worker_name' })
    .select('id')
    .single();

  if (error) {
    log.error({ error }, '워커 등록 실패');
    throw error;
  }

  workerId = data.id;
  log.info({ workerId, workerName }, 'SEO 워커 등록 완료');
}

export async function updateHeartbeat(status: 'online' | 'offline' = 'online'): Promise<boolean> {
  if (!workerId) return false;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('seo_workers')
    .update({
      status,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', workerId);

  if (error) {
    log.warn({ error }, 'heartbeat 업데이트 실패');
    return false;
  }

  const { data } = await supabase
    .from('seo_workers')
    .select('stop_requested')
    .eq('id', workerId)
    .single();

  return data?.stop_requested === true;
}

export async function deregisterWorker(): Promise<void> {
  if (!workerId) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('seo_workers')
    .update({
      status: 'offline',
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', workerId);

  if (error) {
    log.warn({ error }, '워커 해제 실패');
  } else {
    log.info('워커 상태 offline으로 변경');
  }
}
