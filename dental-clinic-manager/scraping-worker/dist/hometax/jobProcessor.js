import { completeJob, failJob } from '../queue/jobConsumer.js';
import { loginToHometax, logoutFromHometax } from './loginService.js';
import { runScraper } from './scrapers/index.js';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { createChildLogger } from '../utils/logger.js';
import { notifySyncComplete, notifySyncFailed, notifySettlementComplete } from '../scheduler/notifier.js';
import { aggregateSettlement } from '../scheduler/monthlySettlement.js';
const log = createChildLogger('jobProcessor');
/** 스크래핑 결과를 hometax_raw_data에 저장 */
async function saveRawData(clinicId, result) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('hometax_raw_data')
        .upsert({
        clinic_id: clinicId,
        data_type: result.dataType,
        year: result.period.year,
        month: result.period.month,
        raw_data: result.records,
        record_count: result.totalCount,
        scraped_at: result.scrapedAt,
    }, {
        onConflict: 'clinic_id,data_type,year,month',
    });
    if (error) {
        log.error({ error, clinicId, dataType: result.dataType }, 'raw_data 저장 실패');
        throw error;
    }
    log.info({ clinicId, dataType: result.dataType, count: result.totalCount }, 'raw_data 저장 완료');
}
/** 동기화 로그 기록 */
async function logSync(clinicId, jobId, dataType, status, recordCount, errorMessage) {
    const supabase = getSupabaseClient();
    await supabase
        .from('scraping_sync_logs')
        .insert({
        clinic_id: clinicId,
        job_id: jobId,
        data_type: dataType,
        status,
        record_count: recordCount,
        error_message: errorMessage || null,
        synced_at: new Date().toISOString(),
    });
}
/** Job 처리 메인 로직 */
export async function processScrapingJob(job) {
    const { id: jobId, clinic_id: clinicId, data_types: dataTypes, target_year: year, target_month: month } = job;
    log.info({ jobId, clinicId, dataTypes, year, month }, 'Job 처리 시작');
    // 1. 홈택스 로그인
    const loginResult = await loginToHometax(clinicId);
    if (!loginResult.success || !loginResult.context) {
        const errorMsg = `홈택스 로그인 실패: ${loginResult.errorMessage}`;
        log.error({ jobId, clinicId, errorCode: loginResult.errorCode }, errorMsg);
        for (const dt of dataTypes) {
            await logSync(clinicId, jobId, dt, 'failed', 0, errorMsg);
        }
        await failJob(jobId, errorMsg, { errorCode: loginResult.errorCode });
        await notifySyncFailed(clinicId, errorMsg, jobId);
        return;
    }
    const context = loginResult.context;
    // 2. 각 데이터 타입별 스크래핑
    const results = {};
    try {
        for (const dataType of dataTypes) {
            try {
                log.info({ jobId, dataType, year, month }, '스크래핑 실행');
                const result = await runScraper(context, dataType, year, month);
                // 결과 저장
                await saveRawData(clinicId, result);
                await logSync(clinicId, jobId, dataType, 'success', result.totalCount);
                results[dataType] = { success: true, count: result.totalCount };
                log.info({ jobId, dataType, count: result.totalCount }, '스크래핑 성공');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error({ jobId, dataType, err }, '스크래핑 실패');
                await logSync(clinicId, jobId, dataType, 'failed', 0, message);
                results[dataType] = { success: false, count: 0, error: message };
            }
        }
    }
    finally {
        // 3. 로그아웃 및 브라우저 정리
        await logoutFromHometax(context);
    }
    // 4. 전체 결과 집계
    const allSuccess = Object.values(results).every(r => r.success);
    const totalRecords = Object.values(results).reduce((sum, r) => sum + r.count, 0);
    if (allSuccess) {
        await completeJob(jobId, {
            results,
            totalRecords,
            completedAt: new Date().toISOString(),
        });
    }
    else {
        const failedTypes = Object.entries(results)
            .filter(([, r]) => !r.success)
            .map(([dt]) => dt);
        // 일부만 실패한 경우에도 Job은 완료 처리 (부분 성공)
        const partialSuccess = Object.values(results).some(r => r.success);
        if (partialSuccess) {
            await completeJob(jobId, {
                results,
                totalRecords,
                partialFailure: true,
                failedTypes,
                completedAt: new Date().toISOString(),
            });
        }
        else {
            await failJob(jobId, `모든 데이터 타입 스크래핑 실패: ${failedTypes.join(', ')}`, results);
        }
    }
    // 5. 알림 발송
    await notifySyncComplete(clinicId, results);
    // 6. 월말 결산 Job인 경우 집계 수행
    if (job.job_type === 'monthly_settlement' && year && month) {
        try {
            const settlement = await aggregateSettlement(clinicId, year, month);
            await notifySettlementComplete(clinicId, year, month, settlement);
            log.info({ jobId, clinicId, year, month }, '월말 결산 집계 및 알림 완료');
        }
        catch (err) {
            log.error({ err, jobId, clinicId }, '월말 결산 집계 실패');
        }
    }
    log.info({ jobId, results, totalRecords }, 'Job 처리 완료');
}
//# sourceMappingURL=jobProcessor.js.map