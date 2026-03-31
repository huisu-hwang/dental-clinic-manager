import { getApiClient, updateHeartbeat } from '../db/supabaseClient.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('jobConsumer');

export interface ScrapingJob {
  id: string;
  clinic_id: string;
  job_type: 'daily_sync' | 'monthly_settlement' | 'manual_sync';
  data_types: string[];
  target_year: number;
  target_month: number;
  target_date: string | null;
  status: string;
  priority: number;
  retry_count: number;
  max_retries: number;
}

/**
 * pending 상태의 Job을 하나 획득 (FOR UPDATE SKIP LOCKED 패턴)
 * API 서버에서 동시성 안전하게 Job 획득
 */
export async function acquireJob(): Promise<ScrapingJob | null> {
  const client = getApiClient();
  
  try {
    const job = await client.acquireScrapingJob(config.worker.id);
    if (!job) {
      return null;
    }

    log.info({ jobId: job.id, jobType: job.job_type, clinicId: job.clinic_id }, 'Job 획득');
    await updateHeartbeat('busy', job.id);
    
    return job as ScrapingJob;
  } catch (err) {
    log.error({ err }, 'Job 획득 실패');
    return null;
  }
}

/** Job 완료 처리 */
export async function completeJob(jobId: string, resultSummary: Record<string, unknown>): Promise<void> {
  const client = getApiClient();
  
  try {
    await client.reportScrapingJobResult(jobId, {
      status: 'completed',
      resultSummary
    });
    log.info({ jobId, resultSummary }, 'Job 완료');
  } catch (err) {
    log.error({ err, jobId }, 'Job 완료 보고 실패');
    throw err;
  } finally {
    await updateHeartbeat('idle');
  }
}

/** Job 실패 처리 (재시도 가능 여부 판단) */
export async function failJob(jobId: string, errorMessage: string, errorDetails?: unknown): Promise<void> {
  const client = getApiClient();

  try {
    await client.reportScrapingJobResult(jobId, {
      status: 'failed',
      errorMessage,
      errorDetails
    });
    log.error({ jobId, errorMessage }, 'Job 실패 보고 완료');
  } catch (err) {
    log.error({ err, jobId }, 'Job 실패 보고 중 오류');
  } finally {
    await updateHeartbeat('idle');
  }
}

/** Job 폴링 루프 */
export async function startPolling(
  processJob: (job: ScrapingJob) => Promise<void>,
): Promise<void> {
  log.info({ interval: config.worker.pollIntervalMs }, 'Job 폴링 시작');

  const poll = async () => {
    try {
      const job = await acquireJob();
      if (job) {
        try {
          await processJob(job);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await failJob(job.id, message, err);
        }
      }
    } catch (err) {
      log.error({ err }, '폴링 중 예외 발생');
    }
  };

  // 초기 폴링
  await poll();

  // 주기적 폴링
  setInterval(poll, config.worker.pollIntervalMs);
}
