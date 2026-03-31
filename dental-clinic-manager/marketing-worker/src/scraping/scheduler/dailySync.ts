import cron from 'node-cron';
import { getApiClient } from '../db/supabaseClient.js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('dailySync');

const ALL_DATA_TYPES = [
  'tax_invoice_sales',
  'tax_invoice_purchase',
  'cash_receipt_sales',
  'cash_receipt_purchase',
  'business_card_purchase',
  'credit_card_sales',
];

/** 활성 클리닉 목록 조회 */
async function getActiveClinics(): Promise<Array<{ clinic_id: string; business_number: string }>> {
  const client = getApiClient();
  const credentials = await client.getHometaxCredentials();
  
  return credentials.filter(c => c.is_active).map(c => ({
    clinic_id: c.clinic_id,
    business_number: c.business_number
  }));
}

/** 전일(D-1) 날짜 계산 */
function getYesterday(): { year: number; month: number; date: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
}

/** 클리닉별 daily_sync Job 생성 (간격 두기) */
async function createDailySyncJobs(): Promise<number> {
  const clinics = await getActiveClinics();

  if (clinics.length === 0) {
    log.info('활성 클리닉 없음, 일일 배치 건너뜀');
    return 0;
  }

  const { year, month, date } = getYesterday();
  const intervalMinutes = config.schedule.clinicIntervalMinutes;
  let created = 0;
  
  const client = getApiClient();

  log.info({ clinicCount: clinics.length, targetDate: date }, '일일 배치 Job 생성 시작');
  
  const jobsToCreate = clinics.map((clinic, i) => {
    // 시차를 둔 scheduled_at 설정 (필요하다면 나중에 DB 모델에 반영 가능, 현재는 pending 상태로 일괄 추가 후 큐에서 지연 획득)
    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + (i * intervalMinutes));

    return {
      clinic_id: clinic.clinic_id,
      job_type: 'daily_sync',
      data_types: ALL_DATA_TYPES,
      target_year: year,
      target_month: month,
      target_date: date,
      status: 'pending',
      priority: 5,
      max_retries: 3,
    };
  });

  try {
    created = await client.createScrapingJobs(jobsToCreate);
    if (created > 0) {
      log.info({ created }, 'daily_sync Job 생성 성공');
    } else {
      log.info('생성된 Job이 없거나 이미 모두 존재합니다.');
    }
  } catch (err) {
    log.error({ err }, 'daily_sync Job 일괄 생성 실패');
  }

  log.info({ created, total: clinics.length }, '일일 배치 Job 생성 완료');
  return created;
}

/** 일일 배치 스케줄러 시작 */
export function startDailySync(): void {
  const cronExpr = config.schedule.dailySyncCron;
  log.info({ cron: cronExpr }, '일일 배치 스케줄러 등록');

  cron.schedule(cronExpr, async () => {
    log.info('일일 배치 실행 시작');
    try {
      const count = await createDailySyncJobs();
      log.info({ jobCount: count }, '일일 배치 실행 완료');
    } catch (err) {
      log.error({ err }, '일일 배치 실행 중 오류');
    }
  }, {
    timezone: 'Asia/Seoul',
  });
}

// 수동 실행용 export
export { createDailySyncJobs };
