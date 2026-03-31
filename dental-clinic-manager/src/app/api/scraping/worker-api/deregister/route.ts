import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { workerId } = body;

    if (!workerId) {
      return NextResponse.json({ error: 'Missing workerId' }, { status: 400 });
    }

    const { error } = await admin
      .from('scraping_workers')
      .update({
        status: 'offline',
        current_job_id: null,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', workerId);

    if (error) {
      console.error('[scraping/deregister] DB Error:', error);
      return NextResponse.json({ error: 'Failed to deregister worker' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/deregister] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
