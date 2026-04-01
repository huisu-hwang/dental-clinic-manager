import { ScrapingJob, completeJob, failJob } from '../queue/jobConsumer.js';
import { loginToHometax, logoutFromHometax } from './loginService.js';
import { runScraper, runScraperWithPage, DataType, getScrapingMode } from './scrapers/index.js';
import type { ScrapeResult } from './scrapers/index.js';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { createChildLogger } from '../utils/logger.js';
import { notifySyncComplete, notifySyncFailed, notifySettlementComplete } from '../scheduler/notifier.js';
import { aggregateSettlement } from '../scheduler/monthlySettlement.js';
import { loginViaProtocol, logoutViaProtocol } from '../protocol/loginProtocol.js';
import { ScrapingSession, getBrowserContext } from '../types/scrapingContext.js';

const log = createChildLogger('jobProcessor');

/** 데이터 타입 → 한글 라벨 */
const DATA_TYPE_LABELS: Record<string, string> = {
  tax_invoice_sales: '세금계산서 매출',
  tax_invoice_purchase: '세금계산서 매입',
  cash_receipt_sales: '현금영수증 매출',
  cash_receipt_purchase: '현금영수증 매입',
  business_card_purchase: '사업용카드 매입',
  credit_card_sales: '신용카드 매출',
};

/** 진행 상태 메시지 업데이트 */
async function updateProgress(jobId: string, message: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from('scraping_jobs')
    .update({ progress_message: message })
    .eq('id', jobId);
  log.info({ jobId, progress: message }, '진행 상태 업데이트');
}

/** 스크래핑 결과를 hometax_raw_data에 저장 */
async function saveRawData(
  clinicId: string,
  result: ScrapeResult,
): Promise<void> {
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
async function logSync(
  clinicId: string,
  jobId: string,
  dataType: string,
  status: 'success' | 'failed',
  recordCount: number,
  errorMessage?: string,
): Promise<void> {
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

/** 모드별 로그인 수행 */
async function login(clinicId: string, mode: 'playwright' | 'protocol'): Promise<{
  success: boolean;
  session: ScrapingSession | null;
  errorMessage?: string;
  errorCode?: string;
}> {
  if (mode === 'protocol') {
    const result = await loginViaProtocol(clinicId);
    return {
      success: result.success,
      session: result.session ? result.session as ScrapingSession : null,
      errorMessage: result.errorMessage,
      errorCode: result.errorCode,
    };
  }

  // Playwright 모드
  const result = await loginToHometax(clinicId);
  return {
    success: result.success,
    session: result.context ? { type: 'playwright' as const, context: result.context } : null,
    errorMessage: result.errorMessage,
    errorCode: result.errorCode,
  };
}

/** 모드별 로그아웃 수행 */
async function logout(session: ScrapingSession): Promise<void> {
  if (session.type === 'protocol') {
    await logoutViaProtocol(session);
  } else if (session.type === 'playwright') {
    await logoutFromHometax(session.context);
  }
}

/** Job 처리 메인 로직 */
export async function processScrapingJob(job: ScrapingJob): Promise<void> {
  const { id: jobId, clinic_id: clinicId, data_types: dataTypes, target_year: year, target_month: month } = job;
  const mode = getScrapingMode();

  log.info({ jobId, clinicId, dataTypes, year, month, mode }, 'Job 처리 시작');

  // 1. 홈택스 로그인
  await updateProgress(jobId, '홈택스 로그인 중...');
  const loginResult = await login(clinicId, mode);
  if (!loginResult.success || !loginResult.session) {
    const errorMsg = `홈택스 로그인 실패: ${loginResult.errorMessage}`;
    log.error({ jobId, clinicId, errorCode: loginResult.errorCode, mode }, errorMsg);

    for (const dt of dataTypes) {
      await logSync(clinicId, jobId, dt, 'failed', 0, errorMsg);
    }

    await failJob(jobId, errorMsg, { errorCode: loginResult.errorCode });
    await notifySyncFailed(clinicId, errorMsg, jobId);
    return;
  }

  const session = loginResult.session;

  // 2. 각 데이터 타입별 스크래핑
  const results: Record<string, { success: boolean; count: number; error?: string }> = {};

  const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

  try {
    if (session.type === 'playwright') {
      // Playwright 모드: 페이지 한 번 생성 후 모든 스크래퍼에 공유
      const browserContext = getBrowserContext(session);
      const sharedPage = await browserContext.newPage();

      try {
        // 메인 페이지 한 번만 로드
        log.info({ jobId }, '공유 페이지 메인 페이지 최초 로드');
        await sharedPage.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
        await sharedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        for (const dataType of dataTypes) {
          try {
            const label = DATA_TYPE_LABELS[dataType] || dataType;
            await updateProgress(jobId, `${label} 자료 수집 중...`);
            log.info({ jobId, dataType, year, month, mode }, '스크래핑 실행 (공유 페이지)');

            const result = await runScraperWithPage(sharedPage, session, dataType as DataType, year, month, clinicId);

            // 결과 저장
            await saveRawData(clinicId, result);
            await logSync(clinicId, jobId, dataType, 'success', result.totalCount);

            results[dataType] = { success: true, count: result.totalCount };
            log.info({ jobId, dataType, count: result.totalCount }, '스크래핑 성공');

            // 다음 스크래퍼를 위해 메인 페이지 복귀 (마지막 타입 제외)
            if (dataType !== dataTypes[dataTypes.length - 1]) {
              log.info({ jobId, dataType }, '다음 스크래퍼를 위한 메인 페이지 복귀');
              await sharedPage.goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
              await sharedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error({ jobId, dataType, err }, '스크래핑 실패');

            await logSync(clinicId, jobId, dataType, 'failed', 0, message);
            results[dataType] = { success: false, count: 0, error: message };

            // 오류 후 메인 페이지 복귀 시도 (다음 스크래퍼를 위해)
            if (dataType !== dataTypes[dataTypes.length - 1]) {
              await sharedPage.goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
              await sharedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            }
          }
        }
      } finally {
        await sharedPage.close().catch(() => {});
      }
    } else {
      // Protocol 모드 (또는 기타): 기존 방식 유지
      for (const dataType of dataTypes) {
        try {
          const label = DATA_TYPE_LABELS[dataType] || dataType;
          await updateProgress(jobId, `${label} 자료 수집 중...`);
          log.info({ jobId, dataType, year, month, mode }, '스크래핑 실행');

          const result = await runScraper(session, dataType as DataType, year, month, clinicId);

          // 결과 저장
          await saveRawData(clinicId, result);
          await logSync(clinicId, jobId, dataType, 'success', result.totalCount);

          results[dataType] = { success: true, count: result.totalCount };
          log.info({ jobId, dataType, count: result.totalCount }, '스크래핑 성공');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error({ jobId, dataType, err }, '스크래핑 실패');

          await logSync(clinicId, jobId, dataType, 'failed', 0, message);
          results[dataType] = { success: false, count: 0, error: message };
        }
      }
    }
  } finally {
    // 3. 로그아웃 및 세션 정리
    await logout(session);
  }

  // 4. 전체 결과 집계
  const allSuccess = Object.values(results).every(r => r.success);
  const totalRecords = Object.values(results).reduce((sum, r) => sum + r.count, 0);

  if (allSuccess) {
    await completeJob(jobId, {
      results,
      totalRecords,
      scrapingMode: mode,
      completedAt: new Date().toISOString(),
    });
  } else {
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
        scrapingMode: mode,
        completedAt: new Date().toISOString(),
      });
    } else {
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
    } catch (err) {
      log.error({ err, jobId, clinicId }, '월말 결산 집계 실패');
    }
  }

  log.info({ jobId, results, totalRecords, mode }, 'Job 처리 완료');
}
