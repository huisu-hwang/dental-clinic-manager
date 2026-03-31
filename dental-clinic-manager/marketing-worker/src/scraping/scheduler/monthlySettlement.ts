import cron from 'node-cron';
import { getApiClient } from '../db/supabaseClient.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('monthlySettlement');

const ALL_DATA_TYPES = [
  'tax_invoice_sales',
  'tax_invoice_purchase',
  'cash_receipt_sales',
  'cash_receipt_purchase',
  'business_card_purchase',
  'credit_card_sales',
];

/** 전월 연/월 계산 */
function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed, 현재 달의 전 달
  if (month === 0) {
    year--;
    month = 12;
  }
  return { year, month };
}

/** 전월 결산 Job 생성 */
async function createMonthlySettlementJobs(): Promise<number> {
  const client = getApiClient();

  // 활성 클리닉 조회
  const credentials = await client.getHometaxCredentials();
  const clinics = credentials.filter(c => c.is_active);

  if (clinics.length === 0) {
    log.info('활성 클리닉 없음, 월말 결산 건너뜀');
    return 0;
  }

  const { year, month } = getPreviousMonth();
  let created = 0;

  log.info({ clinicCount: clinics.length, year, month }, '월말 결산 Job 생성 시작');

  const jobsToCreate = clinics.map((clinic) => {
    return {
      clinic_id: clinic.clinic_id,
      job_type: 'monthly_settlement',
      data_types: ALL_DATA_TYPES,
      target_year: year,
      target_month: month,
      target_date: `${year}-${String(month).padStart(2, '0')}-01`,
      status: 'pending',
      priority: 3, // 결산은 우선순위 높음
      max_retries: 3,
    };
  });

  try {
    created = await client.createScrapingJobs(jobsToCreate);
    if (created > 0) {
      log.info({ created, year, month }, '월말 결산 Job 생성 성공');
    } else {
      log.info('생성된 결산 Job이 없거나 이미 존재합니다.');
    }
  } catch (err) {
    log.error({ err }, '월말 결산 Job 생성 실패');
  }

  log.info({ created, total: clinics.length, year, month }, '월말 결산 Job 생성 완료');
  return created;
}

/** 결산 데이터 집계 (API Mode에서는 대시보드가 처리하도록 위임) */
export async function aggregateSettlement(clinicId: string, year: number, month: number): Promise<Record<string, unknown>> {
  log.info({ clinicId, year, month }, '결산 데이터 집계는 대시보드 API 백엔드로 위임되었습니다.');
  return {};
}

/** 월말 결산 스케줄러 시작 */
export function startMonthlySettlement(): void {
  const cronExpr = config.schedule.monthlySettlementCron;
  log.info({ cron: cronExpr }, '월말 결산 스케줄러 등록');

  cron.schedule(cronExpr, async () => {
    log.info('월말 결산 실행 시작');
    try {
      const count = await createMonthlySettlementJobs();
      log.info({ jobCount: count }, '월말 결산 Job 생성 완료');
    } catch (err) {
      log.error({ err }, '월말 결산 실행 중 오류');
    }
  }, {
    timezone: 'Asia/Seoul',
  });
}

export { createMonthlySettlementJobs };
