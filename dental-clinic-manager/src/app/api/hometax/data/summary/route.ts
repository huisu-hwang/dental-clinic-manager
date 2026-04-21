import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * raw_data 배열에서 특정 연월에 해당하는 레코드만 필터링
 * 홈택스 누계 조회는 연간/반기 전체 데이터를 반환하므로 해당 월 행만 추출
 *
 * 실제 DB 데이터 구조:
 * - cash_receipt_sales: 거래년월 = "2026-01" 형식
 * - business_card_purchase: 거래년월 = "2026-01" 형식
 * - credit_card_sales: 승인년월 = "2026-01" 형식
 */
function findMonthRows(
  records: Record<string, unknown>[],
  year: number,
  targetMonth: number,
): Record<string, unknown>[] {
  // YYYY-MM 형식 (예: "2026-04")
  const yearMonthStr = `${year}-${String(targetMonth).padStart(2, '0')}`;

  // YYYY-MM 형식을 담는 필드명 목록
  const yearMonthFields = ['거래년월', '승인년월', '발행년월', '귀속년월', '거래일자'];

  // "N월" 형식 폴백 (혹시 다른 스크래퍼에서 다른 형식 사용 시)
  const monthPatterns = [
    `${targetMonth}월`,
    `${String(targetMonth).padStart(2, '0')}월`,
  ];
  const monthOnlyFields = ['월', '기간', '거래월', '월별', '조회월'];

  return records.filter(record => {
    // YYYY-MM 형식 필드 확인
    for (const key of yearMonthFields) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        if (String(val).trim() === yearMonthStr) return true;
      }
    }
    // "N월" 형식 필드 확인 (폴백)
    for (const key of monthOnlyFields) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val).replace(/\s/g, '');
        if (monthPatterns.some(p => strVal === p)) return true;
      }
    }
    return false;
  });
}

/**
 * raw_data 레코드 배열에서 해당 월의 금액 추출
 * 해당 월 행이 없으면 전체 행 사용 (폴백 — 예: 신용카드 분기 데이터에서 해당월 미집계 시)
 */
function extractMonthAmount(
  records: Record<string, unknown>[],
  year: number,
  targetMonth: number,
): number {
  if (!Array.isArray(records) || records.length === 0) return 0;

  // 해당 월 행만 필터링; 없으면 전체 행 폴백 (신용카드처럼 분기 데이터에서 해당월 데이터가 아직 없는 경우)
  const monthRows = findMonthRows(records, year, targetMonth);
  const rowsToSum = monthRows.length > 0 ? monthRows : records;

  const amountKeys = [
    // 실제 DB에서 확인된 금액 필드 (우선순위 순)
    '총금액',        // cash_receipt_sales
    '매출액계',      // credit_card_sales
    '합계(①+②)',   // business_card_purchase
    // 범용 폴백
    '합계(③+④)', '합계', '매입금액',
    '거래금액', '매출금액',
    '공급가액(①)', '공급가액(③)', '공급가액', '전체',
    'total_amount', 'supply_amount',
  ];

  let total = 0;
  for (const record of rowsToSum) {
    for (const key of amountKeys) {
      if (record[key] !== undefined && record[key] !== '') {
        const val = String(record[key]).replace(/[,원\s]/g, '');
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          total += num;
          break;
        }
      }
    }
  }
  return total;
}

// GET: 기간별 요약 통계
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId || !year || !month) {
      return NextResponse.json({ error: 'clinicId, year, month가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const targetYear = parseInt(year, 10);
    const targetMonth = parseInt(month, 10);

    const { data, error } = await supabase
      .from('hometax_raw_data')
      .select('data_type, record_count, raw_data, scraped_at')
      .eq('clinic_id', clinicId)
      .eq('year', targetYear)
      .eq('month', targetMonth);

    if (error) {
      return NextResponse.json({ error: '요약 조회에 실패했습니다.' }, { status: 500 });
    }

    // 데이터 타입별 요약 집계 (매출은 덴트웹에서 가져오므로 매입만 활성화)
    const summary: Record<string, { count: number; totalAmount: number; scrapedAt: string | null }> = {
      // cash_receipt_sales: { count: 0, totalAmount: 0, scrapedAt: null },
      cash_receipt_purchase: { count: 0, totalAmount: 0, scrapedAt: null },
      business_card_purchase: { count: 0, totalAmount: 0, scrapedAt: null },
      // credit_card_sales: { count: 0, totalAmount: 0, scrapedAt: null },
    };

    let lastSyncedAt: string | null = null;

    for (const row of (data || [])) {
      if (summary[row.data_type]) {
        const rawRecords = Array.isArray(row.raw_data)
          ? row.raw_data as Record<string, unknown>[]
          : [];

        summary[row.data_type] = {
          count: row.record_count || 0,
          // 해당 월 데이터만 추출 (연간/반기 누계에서 선택 월 행만 사용)
          totalAmount: extractMonthAmount(rawRecords, targetYear, targetMonth),
          scrapedAt: row.scraped_at,
        };

        if (!lastSyncedAt || (row.scraped_at && row.scraped_at > lastSyncedAt)) {
          lastSyncedAt = row.scraped_at;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        clinicId,
        year: targetYear,
        month: targetMonth,
        summary,
        lastSyncedAt,
        hasData: (data || []).length > 0,
      },
    });
  } catch (error) {
    console.error('GET /api/hometax/data/summary error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
