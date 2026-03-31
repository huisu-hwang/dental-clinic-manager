import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, result } = body;

    const { error } = await admin
      .from('hometax_raw_data')
      .upsert({
        clinic_id: clinicId,
        data_type: result.dataType,
        year: result.period.year,
        month: result.period.month,
        raw_data: result.records,
        record_count: result.totalCount,
        scraped_at: result.scrapedAt,
      }, {
        onConflict: 'clinic_id,data_type,year,month',
      });

    if (error) {
      console.error('[scraping/data/raw] DB Error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/data/raw] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
