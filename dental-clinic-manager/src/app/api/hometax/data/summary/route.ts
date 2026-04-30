import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractMonthAmount } from '@/utils/hometaxAmount';

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
