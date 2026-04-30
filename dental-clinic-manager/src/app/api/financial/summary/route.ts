// ============================================
// 재무 요약 API
// GET: 월별/연간 재무 요약 조회 + 올해 누적 예상 세금 계산
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { estimateTax } from '@/utils/taxCalculator';
import type { ClinicTaxSettings } from '@/types/financial';
import { extractMonthAmount } from '@/utils/hometaxAmount';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// 홈택스 사업용카드 매입금액 조회 (해당 월 데이터만)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBusinessCardPurchase(supabase: any, clinicId: string, year: number, month: number): Promise<number> {
  const { data } = await supabase
    .from('hometax_raw_data')
    .select('raw_data')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .eq('data_type', 'business_card_purchase')
    .maybeSingle();

  if (!data?.raw_data) return 0;
  const records = Array.isArray(data.raw_data) ? data.raw_data : [];
  return extractMonthAmount(records as Record<string, unknown>[], year, month);
}

// clinic_tax_settings 조회 (없으면 null → 기본값으로 동작)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTaxSettings(supabase: any, clinicId: string): Promise<ClinicTaxSettings | null> {
  const { data } = await supabase
    .from('clinic_tax_settings')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return (data as ClinicTaxSettings | null) ?? null;
}

// 올해 1월 ~ asOfMonth까지 누적 순이익(수입 - 지출) 계산 via financial_summary_view
async function loadYtdMonths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clinicId: string,
  year: number,
  asOfMonth: number
) {
  const { data } = await supabase
    .from('financial_summary_view')
    .select('month, total_revenue, total_expense, pre_tax_profit')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .lte('month', asOfMonth)
    .order('month', { ascending: true });
  return (data ?? []) as Array<{ month: number; total_revenue: number | null; total_expense: number | null; pre_tax_profit: number | null }>;
}

// dentweb 연동 클리닉에서 해당 월 revenue가 없으면 pending 요청 추가
async function requestRevenueSyncIfNeeded(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clinicId: string,
  year: number,
  month: number,
): Promise<boolean> {
  // dentweb_sync_config가 있는지 (= dentweb 연동 클리닉인지) 확인
  const { data: syncConfig } = await supabase
    .from('dentweb_sync_config')
    .select('id, pending_revenue_months, is_active')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .maybeSingle();

  if (!syncConfig) return false;

  // 해당 월 revenue_records가 있는지 확인
  const { data: existingRevenue } = await supabase
    .from('revenue_records')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existingRevenue) return false; // 이미 데이터 있음

  // pending 목록에 이미 있는지 확인
  const pending = (syncConfig.pending_revenue_months || []) as Array<{ year: number; month: number }>;
  const alreadyPending = pending.some((p: { year: number; month: number }) => p.year === year && p.month === month);
  if (alreadyPending) return false; // 이미 요청됨 — 워커가 처리할 때까지 배너 미표시

  // pending 목록에 추가
  const updated = [...pending, { year, month }];
  await supabase
    .from('dentweb_sync_config')
    .update({ pending_revenue_months: updated })
    .eq('id', syncConfig.id);

  return true; // 새로 요청함 — 배너 표시 + 폴링 시작
}

// GET: 재무 요약 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId || !year) {
      return NextResponse.json({ error: 'clinicId와 year가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const yearNum = parseInt(year);

    // 월별 조회
    if (month) {
      const monthNum = parseInt(month);

      // 모든 독립 쿼리를 병렬 실행 (기존 5~7개 순차 → 병렬)
      const [
        summaryResult,
        revenueResult,
        syncPending,
        ytdMonths,
        settings,
        businessCardPurchase,
      ] = await Promise.all([
        // 1. 재무 요약 조회
        supabase
          .from('financial_summary_view')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('year', yearNum)
          .eq('month', monthNum)
          .single(),
        // 2. revenue_records에서 source_type 조회
        supabase
          .from('revenue_records')
          .select('source_type')
          .eq('clinic_id', clinicId)
          .eq('year', yearNum)
          .eq('month', monthNum)
          .single(),
        // 3. dentweb 연동인데 해당 월 revenue가 없으면 on-demand 동기화 요청
        requestRevenueSyncIfNeeded(supabase, clinicId, yearNum, monthNum),
        // 4. 올해 누적 순이익
        loadYtdMonths(supabase, clinicId, yearNum, monthNum),
        // 5. 세무 설정
        loadTaxSettings(supabase, clinicId),
        // 6. 홈택스 사업용카드 매입 (총 지출 합산용)
        loadBusinessCardPurchase(supabase, clinicId, yearNum, monthNum),
      ]);

      const { data, error } = summaryResult;
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching financial summary:', error);
        return NextResponse.json({ error: '재무 요약 조회에 실패했습니다.' }, { status: 500 });
      }

      const revenueRecord = revenueResult.data;

      // 사업용카드 매입을 총 지출에 합산 (별도 카테고리로 분류 — 기존 expense_records와 중복 없음)
      const baseExpense = Number(data?.total_expense || 0);
      const totalExpenseWithCard = baseExpense + businessCardPurchase;
      const totalRevenue = Number(data?.total_revenue || 0);
      const preTaxProfit = totalRevenue - totalExpenseWithCard;

      // YTD 누적 순이익에도 사업용카드 매입 반영
      const ytdMonthsWithCard = await Promise.all(
        ytdMonths.map(async m => {
          const cardAmount = await loadBusinessCardPurchase(supabase, clinicId, yearNum, m.month);
          return {
            ...m,
            total_expense: (m.total_expense || 0) + cardAmount,
          };
        })
      );

      const ytdNetIncome = ytdMonthsWithCard.reduce(
        (sum, m) => sum + ((m.total_revenue || 0) - (m.total_expense || 0)),
        0
      );
      const elapsed = ytdMonthsWithCard.length > 0
        ? Math.max(...ytdMonthsWithCard.map(m => m.month))
        : monthNum;
      const est = estimateTax(ytdNetIncome, settings, elapsed);

      return NextResponse.json({
        success: true,
        sync_pending: syncPending,
        data: {
          ...(data || {}),
          total_expense: totalExpenseWithCard,
          business_card_purchase: businessCardPurchase,
          pre_tax_profit: preTaxProfit,
          revenue_source_type: revenueRecord?.source_type || null,
          ytd_net_income: est.ytd_net_income,
          estimated_taxable_income: est.estimated_taxable_income,
          estimated_income_tax: est.estimated_income_tax,
          estimated_local_tax: est.estimated_local_tax,
          estimated_total_tax: est.estimated_total_tax,
          estimated_post_tax_profit: est.estimated_post_tax_profit,
          estimated_elapsed_months: est.elapsed_months,
        }
      });
    }

    // 연간 조회
    const { data, error } = await supabase
      .from('financial_summary_view')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('year', yearNum)
      .order('month', { ascending: true });

    if (error) {
      console.error('Error fetching annual financial summary:', error);
      return NextResponse.json({ error: '연간 재무 요약 조회에 실패했습니다.' }, { status: 500 });
    }

    const months = data || [];

    // 연간 합계 계산
    const initialTotals = {
      total_revenue: 0,
      total_expense: 0,
      total_tax: 0,
      pre_tax_profit: 0,
      post_tax_profit: 0,
    };

    const totals = months.reduce(
      (acc: typeof initialTotals, m: Record<string, number | null>) => ({
        total_revenue: acc.total_revenue + (m.total_revenue || 0),
        total_expense: acc.total_expense + (m.total_expense || 0),
        total_tax: acc.total_tax + (m.actual_tax_paid || 0),
        pre_tax_profit: acc.pre_tax_profit + (m.pre_tax_profit || 0),
        post_tax_profit: acc.post_tax_profit + (m.post_tax_profit || 0),
      }),
      initialTotals
    );

    const monthCount = months.length || 1;
    const ytdNetIncome = totals.total_revenue - totals.total_expense;

    // 연간 기준 예상 세금 계산 (경과월 = 데이터가 있는 월 수 또는 현재 달)
    const settings = await loadTaxSettings(supabase, clinicId);
    const elapsed = months.length > 0
      ? Math.max(...months.map((m: Record<string, number>) => m.month))
      : Math.min(12, new Date().getMonth() + 1);
    const est = estimateTax(ytdNetIncome, settings, elapsed);

    return NextResponse.json({
      success: true,
      data: {
        clinic_id: clinicId,
        year: yearNum,
        months,
        totals: {
          ...totals,
          average_monthly_revenue: Math.round(totals.total_revenue / monthCount),
          average_monthly_expense: Math.round(totals.total_expense / monthCount),
          average_profit_margin:
            totals.total_revenue > 0
              ? Math.round(((totals.pre_tax_profit / totals.total_revenue) * 100) * 100) / 100
              : 0,
          ytd_net_income: est.ytd_net_income,
          estimated_taxable_income: est.estimated_taxable_income,
          estimated_income_tax: est.estimated_income_tax,
          estimated_local_tax: est.estimated_local_tax,
          estimated_total_tax: est.estimated_total_tax,
          estimated_post_tax_profit: est.estimated_post_tax_profit,
          estimated_elapsed_months: est.elapsed_months,
        },
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/summary:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
