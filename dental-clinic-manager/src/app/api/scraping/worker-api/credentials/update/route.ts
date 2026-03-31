import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, updateData } = body;

    if (!clinicId || !updateData) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const { error } = await admin
      .from('scp_hometax_credentials')
      .update(updateData)
      .eq('clinic_id', clinicId);

    if (error) {
      console.error('[scraping/credentials/update] DB Error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/credentials/update] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
