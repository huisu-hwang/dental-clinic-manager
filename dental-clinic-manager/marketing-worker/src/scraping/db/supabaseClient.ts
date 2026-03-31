import { WorkerApiClient } from '../../../api-client.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('supabase-adapter');

let apiClient: WorkerApiClient | null = null;

export function getApiClient(): WorkerApiClient {
  if (!apiClient) {
    if (!config.api.dashboardUrl || !config.api.workerApiKey) {
      throw new Error('API config missing: dashboardUrl or workerApiKey');
    }
    const dashUrl = config.api.dashboardUrl.replace(/\/$/, '');
    apiClient = new WorkerApiClient(dashUrl, config.api.workerApiKey);
    log.info('API 클라이언트 초기화 완료');
  }
  return apiClient;
}

// 하위 호환성 및 마이그레이션을 위한 에러 투척용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseClient(): any {
  throw new Error('API Mode 진행 중: 더 이상 getSupabaseClient()를 사용하지 마세요.');
}

/** API 연결 테스트 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getApiClient();
    await client.sendScrapingHeartbeat(config.worker.id, 'idle');
    log.info('API 서버 연결 테스트 성공');
    return true;
  } catch (err) {
    log.error({ err }, 'API 서버 연결 테스트 실패');
    return false;
  }
}

/** 워커 등록 */
export async function registerWorker(): Promise<void> {
  try {
    const client = getApiClient();
    const os = await import('os');
    await client.registerScrapingWorker({
      workerId: config.worker.id,
      hostname: os.hostname(),
      metadata: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
    log.info({ workerId: config.worker.id }, '워커 등록 완료');
  } catch (err) {
    log.error({ err }, '워커 등록 실패');
    throw err;
  }
}

/** 하트비트 업데이트 */
export async function updateHeartbeat(status: 'idle' | 'busy' = 'idle', currentJobId?: string): Promise<boolean> {
  try {
    const client = getApiClient();
    const result = await client.sendScrapingHeartbeat(config.worker.id, status, currentJobId || null);
    return result.stop_requested;
  } catch (err) {
    log.warn({ err }, 'heartbeat 업데이트 실패');
    return false;
  }
}

/** 워커 해제 */
export async function deregisterWorker(): Promise<void> {
  try {
    const client = getApiClient();
    await client.deregisterScrapingWorker(config.worker.id);
    log.info('워커 상태 offline으로 변경');
  } catch (err) {
    log.warn({ err }, '워커 해제 실패');
  }
}

