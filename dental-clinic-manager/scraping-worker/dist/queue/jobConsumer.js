import { getSupabaseClient, updateHeartbeat } from '../db/supabaseClient.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
const log = createChildLogger('jobConsumer');
/**
 * pending 상태의 Job을 하나 획득 (FOR UPDATE SKIP LOCKED 패턴)
 * PostgreSQL advisory lock을 사용하여 동시성 안전하게 Job 획득
 */
export async function acquireJob() {
    const supabase = getSupabaseClient();
    // RPC로 atomic하게 Job 획득 (service_role이므로 RLS 우회)
    const { data, error } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
    if (error || !data) {
        return null;
    }
    // status를 running으로 변경 (낙관적 락)
    const { data: updated, error: updateError } = await supabase
        .from('scraping_jobs')
        .update({
        status: 'running',
        worker_id: config.worker.id,
        started_at: new Date().toISOString(),
    })
        .eq('id', data.id)
        .eq('status', 'pending') // 다른 워커가 먼저 가져간 경우 방지
        .select()
        .single();
    if (updateError || !updated) {
        log.debug('Job 획득 경합 발생, 다음 폴링에서 재시도');
        return null;
    }
    log.info({ jobId: updated.id, jobType: updated.job_type, clinicId: updated.clinic_id }, 'Job 획득');
    await updateHeartbeat('busy', updated.id);
    return updated;
}
/** Job 완료 처리 */
export async function completeJob(jobId, resultSummary) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('scraping_jobs')
        .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_summary: resultSummary,
    })
        .eq('id', jobId);
    if (error) {
        log.error({ error, jobId }, 'Job 완료 업데이트 실패');
        throw error;
    }
    log.info({ jobId, resultSummary }, 'Job 완료');
    await updateHeartbeat('idle');
}
/** Job 실패 처리 (재시도 가능 여부 판단) */
export async function failJob(jobId, errorMessage, errorDetails) {
    const supabase = getSupabaseClient();
    // 현재 retry_count 조회
    const { data: job } = await supabase
        .from('scraping_jobs')
        .select('retry_count, max_retries')
        .eq('id', jobId)
        .single();
    const retryCount = (job?.retry_count ?? 0) + 1;
    const maxRetries = job?.max_retries ?? 3;
    const shouldRetry = retryCount < maxRetries;
    const { error } = await supabase
        .from('scraping_jobs')
        .update({
        status: shouldRetry ? 'pending' : 'failed',
        error_message: errorMessage,
        error_details: errorDetails ? JSON.parse(JSON.stringify(errorDetails)) : null,
        retry_count: retryCount,
        worker_id: null,
        completed_at: shouldRetry ? null : new Date().toISOString(),
    })
        .eq('id', jobId);
    if (error) {
        log.error({ error, jobId }, 'Job 실패 업데이트 실패');
    }
    if (shouldRetry) {
        log.warn({ jobId, retryCount, maxRetries }, 'Job 재시도 예정');
    }
    else {
        log.error({ jobId, errorMessage }, 'Job 최종 실패');
    }
    await updateHeartbeat('idle');
}
/** Job 폴링 루프 */
export async function startPolling(processJob) {
    log.info({ interval: config.worker.pollIntervalMs }, 'Job 폴링 시작');
    const poll = async () => {
        try {
            const job = await acquireJob();
            if (job) {
                try {
                    await processJob(job);
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    await failJob(job.id, message, err);
                }
            }
        }
        catch (err) {
            log.error({ err }, '폴링 중 예외 발생');
        }
    };
    // 초기 폴링
    await poll();
    // 주기적 폴링
    setInterval(poll, config.worker.pollIntervalMs);
}
//# sourceMappingURL=jobConsumer.js.map