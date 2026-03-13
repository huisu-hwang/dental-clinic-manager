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
      .select('data_type, record_count, scraped_at')
      .eq('clinic_id', clinicId)
      .eq('year', parseInt(year, 10))
      .eq('month', parseInt(month, 10));

    if (error) {
      return NextResponse.json({ error: '요약 조회에 실패했습니다.' }, { status: 500 });
    }

    // 데이터 타입별 요약 집계
    const summary: Record<string, { count: number; scrapedAt: string | null }> = {
      tax_invoice_sales: { count: 0, scrapedAt: null },
      tax_invoice_purchase: { count: 0, scrapedAt: null },
      cash_receipt_sales: { count: 0, scrapedAt: null },
      cash_receipt_purchase: { count: 0, scrapedAt: null },
      business_card_purchase: { count: 0, scrapedAt: null },
      credit_card_sales: { count: 0, scrapedAt: null },
    };

    let lastSyncedAt: string | null = null;

    for (const row of (data || [])) {
      if (summary[row.data_type]) {
        summary[row.data_type] = {
          count: row.record_count || 0,
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
