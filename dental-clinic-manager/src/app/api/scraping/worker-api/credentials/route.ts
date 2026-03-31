import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    let query = admin.from('scp_hometax_credentials').select('*');
    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    const { data: credentials, error } = await query;
    if (error) {
      console.error('[scraping/credentials] DB Error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ credentials });
  } catch (error) {
    console.error('[scraping/credentials] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
