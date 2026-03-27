import { getSupabaseClient, updateHeartbeat } from '../db/supabaseClient.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('jobConsumer');

export interface SeoJob {
  id: string;
  job_type: 'keyword_analysis' | 'competitor_compare';
  status: string;
  params: {
    keyword: string;
    myPostUrl?: string;
  };
  retry_count: number;
  max_retries: number;
  created_by: string;
}

/** pending 상태의 Job을 하나 획득 */
export async function acquireJob(): Promise<SeoJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('seo_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  const { data: updated, error: updateError } = await supabase
    .from('seo_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .eq('status', 'pending')
    .select()
    .single();

  if (updateError || !updated) {
    log.debug('Job 획득 경합 발생, 다음 폴링에서 재시도');
    return null;
  }

  log.info({ jobId: updated.id, jobType: updated.job_type }, 'Job 획득');
  return updated as SeoJob;
}

/** Job 완료 처리 */
export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('seo_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result,
    })
    .eq('id', jobId);

  if (error) {
    log.error({ error, jobId }, 'Job 완료 업데이트 실패');
    throw error;
  }

  log.info({ jobId }, 'Job 완료');
}

/** Job 실패 처리 (재시도 가능 여부 판단) */
export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: job } = await supabase
    .from('seo_jobs')
    .select('retry_count, max_retries')
    .eq('id', jobId)
    .single();

  const retryCount = (job?.retry_count ?? 0) + 1;
  const maxRetries = job?.max_retries ?? 2;
  const shouldRetry = retryCount < maxRetries;

  const { error } = await supabase
    .from('seo_jobs')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      error_message: errorMessage,
      retry_count: retryCount,
      completed_at: shouldRetry ? null : new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    log.error({ error, jobId }, 'Job 실패 업데이트 실패');
  }

  if (shouldRetry) {
    log.warn({ jobId, retryCount, maxRetries }, 'Job 재시도 예정');
  } else {
    log.error({ jobId, errorMessage }, 'Job 최종 실패');
  }
}

/** Job 폴링 루프 */
export async function startPolling(
  processJob: (job: SeoJob) => Promise<void>,
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
          await failJob(job.id, message);
        }
      }
    } catch (err) {
      log.error({ err }, '폴링 중 예외 발생');
    }
  };

  await poll();
  setInterval(poll, config.worker.pollIntervalMs);
}
