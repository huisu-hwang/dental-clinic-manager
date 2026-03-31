import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { log } = body;

    const { error } = await admin
      .from('scraping_sync_logs')
      .insert(log);

    if (error) {
      console.error('[scraping/sync-logs] DB Update Error:', error);
      return NextResponse.json({ error: 'Failed to insert sync log' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/sync-logs] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
