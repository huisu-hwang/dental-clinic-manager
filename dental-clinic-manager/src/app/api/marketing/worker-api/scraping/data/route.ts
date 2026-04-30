import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// POST: 수집 데이터 저장 (hometax_raw_data 테이블)
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      jobId,
      clinicId,
      dataType,
      year,
      month,
      rawData,
      summary,
    } = body as {
      jobId?: string;
      clinicId: string;
      dataType: string;
      year: number;
      month: number;
      rawData: Record<string, unknown>[];
      summary?: { totalCount?: number; totalAmount?: number };
    };

    if (!clinicId || !dataType || !year || !month || !Array.isArray(rawData)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const recordCount = summary?.totalCount ?? rawData.length;
    const totalAmount = summary?.totalAmount ?? 0;

    // hometax_raw_data upsert (clinic_id, data_type, year, month) 키
    const { error: upsertError } = await admin
      .from('hometax_raw_data')
      .upsert(
        {
          clinic_id: clinicId,
          job_id: jobId ?? null,
          data_type: dataType,
          year,
          month,
          raw_data: rawData,
          record_count: recordCount,
          total_amount: totalAmount,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,data_type,year,month' }
      );

    if (upsertError) {
      console.error('[worker-api/scraping/data] upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Data save failed: ' + upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, count: recordCount });
  } catch (error) {
    console.error('[worker-api/scraping/data POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
