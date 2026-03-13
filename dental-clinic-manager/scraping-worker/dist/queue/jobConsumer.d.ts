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
 * PostgreSQL advisory lock을 사용하여 동시성 안전하게 Job 획득
 */
export declare function acquireJob(): Promise<ScrapingJob | null>;
/** Job 완료 처리 */
export declare function completeJob(jobId: string, resultSummary: Record<string, unknown>): Promise<void>;
/** Job 실패 처리 (재시도 가능 여부 판단) */
export declare function failJob(jobId: string, errorMessage: string, errorDetails?: unknown): Promise<void>;
/** Job 폴링 루프 */
export declare function startPolling(processJob: (job: ScrapingJob) => Promise<void>): Promise<void>;
//# sourceMappingURL=jobConsumer.d.ts.map