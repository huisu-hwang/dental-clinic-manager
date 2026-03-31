import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { workerId, status, currentJobId } = body;

    if (!workerId) {
      return NextResponse.json({ error: 'Missing workerId' }, { status: 400 });
    }

    // 1. Update heartbeat
    const { error } = await admin
      .from('scraping_workers')
      .update({
        status: status || 'idle',
        current_job_id: currentJobId || null,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', workerId);

    if (error) {
      console.error('[scraping/heartbeat] DB Update Error:', error);
      return NextResponse.json({ error: 'Failed to update heartbeat' }, { status: 500 });
    }

    // 2. Fetch stop_requested flag
    const { data } = await admin
      .from('scraping_workers')
      .select('stop_requested')
      .eq('id', workerId)
      .single();

    return NextResponse.json({ stop_requested: data?.stop_requested === true });
  } catch (error) {
    console.error('[scraping/heartbeat] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
