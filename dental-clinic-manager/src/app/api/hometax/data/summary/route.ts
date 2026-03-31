import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
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

    const { data, error } = await supabase
      .from('hometax_raw_data')
      .select('data_type, record_count, raw_data, scraped_at')
      .eq('clinic_id', clinicId)
      .eq('year', parseInt(year, 10))
      .eq('month', parseInt(month, 10));

    if (error) {
      return NextResponse.json({ error: '요약 조회에 실패했습니다.' }, { status: 500 });
    }

    /** raw_data 레코드 배열에서 총 금액 추출 */
    function extractTotalAmount(records: Record<string, unknown>[]): number {
      if (!Array.isArray(records) || records.length === 0) return 0;
      let total = 0;
      for (const record of records) {
        const amountKeys = [
          '합계(①+②)', '합계(③+④)', '합계', '총금액', '매입금액',
          '공급가액(①)', '공급가액(③)', '공급가액', '전체',
          'total_amount', 'supply_amount',
        ];
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

    // 데이터 타입별 요약 집계 (세금계산서 제외)
    const summary: Record<string, { count: number; totalAmount: number; scrapedAt: string | null }> = {
      cash_receipt_sales: { count: 0, totalAmount: 0, scrapedAt: null },
      cash_receipt_purchase: { count: 0, totalAmount: 0, scrapedAt: null },
      business_card_purchase: { count: 0, totalAmount: 0, scrapedAt: null },
      credit_card_sales: { count: 0, totalAmount: 0, scrapedAt: null },
    };

    let lastSyncedAt: string | null = null;

    for (const row of (data || [])) {
      if (summary[row.data_type]) {
        const rawRecords = Array.isArray(row.raw_data) ? row.raw_data as Record<string, unknown>[] : [];
        summary[row.data_type] = {
          count: row.record_count || 0,
          totalAmount: extractTotalAmount(rawRecords),
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
        year: parseInt(year, 10),
        month: parseInt(month, 10),
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
