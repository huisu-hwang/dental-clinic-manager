import { getConfig, getDentwebConfig } from '../config-store';
import { log } from '../logger';

// ============================================
// 덴트웹 Supabase API 클라이언트
// dentweb-bridge-agent/src/api-client.ts 에서 이식
// ============================================

const AGENT_VERSION = '2.0.0-electron';

interface SyncResponse {
  success: boolean;
  sync_log_id?: string;
  total_records: number;
  new_records: number;
  updated_records: number;
  error?: string;
}

interface StatusResponse {
  success: boolean;
  data?: {
    is_active: boolean;
    sync_interval_seconds: number;
    last_sync_at: string | null;
    last_sync_status: string | null;
    total_patients: number;
  };
  error?: string;
}

export interface WorkerConfigResponse {
  success: boolean;
  data?: {
    clinic_id: string;
    api_key: string;
    sync_interval_seconds: number;
    is_active: boolean;
  };
  error?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 8000;
        log(
          'warn',
          `[Dentweb/API] 네트워크 오류, ${delay / 1000}초 후 재시도 (${attempt + 1}/${retries}): ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('All retries failed');
}

function getDashboardUrl(): string {
  return getConfig().dashboardUrl || 'https://www.hi-clinic.co.kr';
}

// Supabase API로 환자 데이터 동기화 전송
export async function syncPatients(
  patients: Record<string, unknown>[],
  syncType: 'full' | 'incremental'
): Promise<SyncResponse> {
  const dentweb = getDentwebConfig();
  const url = `${getDashboardUrl()}/api/dentweb/sync`;

  try {
    log('info', `[Dentweb/API] Sending ${patients.length} patients to sync API (${syncType})...`);

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clinic_id: dentweb.clinicId,
        api_key: dentweb.apiKey,
        sync_type: syncType,
        patients,
        agent_version: AGENT_VERSION,
      }),
    });

    const data = (await response.json()) as SyncResponse;

    if (!response.ok) {
      log('error', `[Dentweb/API] Sync API responded with ${response.status}: ${data.error || ''}`);
      return {
        success: false,
        total_records: patients.length,
        new_records: 0,
        updated_records: 0,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    log(
      'info',
      `[Dentweb/API] Sync completed — total: ${data.total_records}, new: ${data.new_records}, updated: ${data.updated_records}`
    );

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log('error', `[Dentweb/API] Sync API call failed (all retries exhausted): ${message}`);
    return {
      success: false,
      total_records: patients.length,
      new_records: 0,
      updated_records: 0,
      error: message,
    };
  }
}

// 동기화 상태 확인 (heartbeat)
export async function checkStatus(): Promise<StatusResponse> {
  const dentweb = getDentwebConfig();
  if (!dentweb.clinicId || !dentweb.apiKey) {
    return { success: false, error: 'Missing dentweb clinic_id or api_key' };
  }

  const url = `${getDashboardUrl()}/api/dentweb/status?clinic_id=${encodeURIComponent(dentweb.clinicId)}&api_key=${encodeURIComponent(dentweb.apiKey)}`;

  try {
    const response = await fetchWithRetry(url, undefined, 1);
    const data = (await response.json()) as StatusResponse;

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// Worker용 덴트웹 설정 자동 조회 (workerApiKey 인증)
export async function fetchWorkerConfig(): Promise<WorkerConfigResponse> {
  const cfg = getConfig();
  if (!cfg.workerApiKey) {
    return { success: false, error: 'workerApiKey not set' };
  }

  const url = `${getDashboardUrl()}/api/dentweb/worker-config`;

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.workerApiKey}`,
        },
      },
      1
    );
    const data = (await response.json()) as WorkerConfigResponse;

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
