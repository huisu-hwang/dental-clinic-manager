import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// POST: 수집 데이터 저장
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      jobId,
      clinicId,
      dataType,
      periodFrom,
      periodTo,
      rawData,
      summary,
    } = body as {
      jobId: string;
      clinicId: string;
      dataType: string;
      periodFrom: string;
      periodTo: string;
      rawData: Record<string, unknown>[];
      summary?: { totalCount: number; totalAmount: number };
    };

    if (!clinicId || !dataType || !periodFrom || !periodTo || !rawData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // hometax_raw_data upsert
    const { error: upsertError } = await admin
      .from('hometax_raw_data')
      .upsert(
        {
          clinic_id: clinicId,
          data_type: dataType,
          period_from: periodFrom,
          period_to: periodTo,
          raw_data: rawData,
          total_count: summary?.totalCount ?? rawData.length,
          total_amount: summary?.totalAmount ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,data_type,period_from,period_to' }
      );

    if (upsertError) {
      console.error('[worker-api/scraping/data] upsert error:', upsertError);
      return NextResponse.json({ error: 'Data save failed: ' + upsertError.message }, { status: 500 });
    }

    // scraping_sync_logs 기록
    await admin
      .from('scraping_sync_logs')
      .insert({
        job_id: jobId ?? null,
        clinic_id: clinicId,
        data_type: dataType,
        period_from: periodFrom,
        period_to: periodTo,
        record_count: summary?.totalCount ?? rawData.length,
        total_amount: summary?.totalAmount ?? null,
        synced_at: new Date().toISOString(),
      });

    return NextResponse.json({ ok: true, count: summary?.totalCount ?? rawData.length });
  } catch (error) {
    console.error('[worker-api/scraping/data POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
