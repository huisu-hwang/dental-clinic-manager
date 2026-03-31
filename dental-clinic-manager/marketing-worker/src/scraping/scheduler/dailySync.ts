import cron from 'node-cron';
import { getSupabaseClient } from '../db/supabaseClient.js';
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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('hometax_credentials')
    .select('clinic_id, business_number')
    .eq('is_active', true);

  if (error) {
    log.error({ error }, '활성 클리닉 조회 실패');
    return [];
  }

  return data || [];
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
  const supabase = getSupabaseClient();
  const intervalMinutes = config.schedule.clinicIntervalMinutes;
  let created = 0;

  log.info({ clinicCount: clinics.length, targetDate: date }, '일일 배치 Job 생성 시작');

  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i];

    // 이미 오늘 생성된 daily_sync Job이 있는지 확인
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('scraping_jobs')
      .select('id')
      .eq('clinic_id', clinic.clinic_id)
      .eq('job_type', 'daily_sync')
      .eq('target_date', date)
      .gte('created_at', `${today}T00:00:00`)
      .limit(1)
      .single();

    if (existing) {
      log.debug({ clinicId: clinic.clinic_id }, '이미 생성된 daily_sync Job 존재, 건너뜀');
      continue;
    }

    // 시차를 둔 scheduled_at 설정
    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + (i * intervalMinutes));

    const { error } = await supabase
      .from('scraping_jobs')
      .insert({
        clinic_id: clinic.clinic_id,
        job_type: 'daily_sync',
        data_types: ALL_DATA_TYPES,
        target_year: year,
        target_month: month,
        target_date: date,
        status: 'pending',
        priority: 5,
        max_retries: 3,
      });

    if (error) {
      log.error({ error, clinicId: clinic.clinic_id }, 'daily_sync Job 생성 실패');
    } else {
      created++;
      log.info({ clinicId: clinic.clinic_id, order: i + 1, totalClinics: clinics.length }, 'daily_sync Job 생성');
    }
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
