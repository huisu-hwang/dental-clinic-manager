import cron from 'node-cron';
import { getSupabaseClient } from '../db/supabaseClient.js';
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
  const supabase = getSupabaseClient();

  // 활성 클리닉 조회
  const { data: clinics, error: clinicError } = await supabase
    .from('hometax_credentials')
    .select('clinic_id')
    .eq('is_active', true);

  if (clinicError || !clinics?.length) {
    log.info('활성 클리닉 없음, 월말 결산 건너뜀');
    return 0;
  }

  const { year, month } = getPreviousMonth();
  let created = 0;

  log.info({ clinicCount: clinics.length, year, month }, '월말 결산 Job 생성 시작');

  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i];

    // 이미 이번 달에 생성된 monthly_settlement Job이 있는지 확인
    const thisMonth = new Date();
    const thisMonthStart = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: existing } = await supabase
      .from('scraping_jobs')
      .select('id')
      .eq('clinic_id', clinic.clinic_id)
      .eq('job_type', 'monthly_settlement')
      .eq('target_year', year)
      .eq('target_month', month)
      .gte('created_at', thisMonthStart)
      .limit(1)
      .single();

    if (existing) {
      log.debug({ clinicId: clinic.clinic_id }, '이미 생성된 monthly_settlement Job 존재, 건너뜀');
      continue;
    }

    const { error } = await supabase
      .from('scraping_jobs')
      .insert({
        clinic_id: clinic.clinic_id,
        job_type: 'monthly_settlement',
        data_types: ALL_DATA_TYPES,
        target_year: year,
        target_month: month,
        target_date: `${year}-${String(month).padStart(2, '0')}-01`,
        status: 'pending',
        priority: 3, // 결산은 우선순위 높음
        max_retries: 3,
      });

    if (error) {
      log.error({ error, clinicId: clinic.clinic_id }, 'monthly_settlement Job 생성 실패');
    } else {
      created++;
    }
  }

  log.info({ created, total: clinics.length, year, month }, '월말 결산 Job 생성 완료');
  return created;
}

/** 결산 데이터 집계 (Job 완료 후 호출) */
export async function aggregateSettlement(clinicId: string, year: number, month: number): Promise<Record<string, unknown>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('hometax_raw_data')
    .select('data_type, raw_data, record_count')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month);

  if (error || !data) {
    log.error({ error, clinicId, year, month }, '결산 데이터 조회 실패');
    return {};
  }

  const settlement: Record<string, { count: number; totalAmount: number }> = {};

  for (const row of data) {
    const records = (row.raw_data as Record<string, unknown>[]) || [];
    let totalAmount = 0;

    for (const record of records) {
      const amount = Number(record.total_amount || record.supply_amount || 0);
      totalAmount += amount;
    }

    settlement[row.data_type] = {
      count: row.record_count || records.length,
      totalAmount,
    };
  }

  // 결산 결과를 hometax_raw_data에 메타로 저장
  await supabase
    .from('hometax_raw_data')
    .upsert({
      clinic_id: clinicId,
      data_type: 'monthly_settlement',
      year,
      month,
      raw_data: settlement,
      record_count: Object.keys(settlement).length,
      scraped_at: new Date().toISOString(),
    }, {
      onConflict: 'clinic_id,data_type,year,month',
    });

  log.info({ clinicId, year, month, settlement }, '월말 결산 집계 완료');
  return settlement;
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
