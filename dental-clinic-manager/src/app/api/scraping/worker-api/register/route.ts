import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { workerId, hostname, metadata } = body;

    if (!workerId) {
      return NextResponse.json({ error: 'Missing workerId' }, { status: 400 });
    }

    const { error } = await admin
      .from('scraping_workers')
      .upsert({
        id: workerId,
        hostname: hostname || 'unknown',
        status: 'idle',
        stop_requested: false,
        last_heartbeat: new Date().toISOString(),
        started_at: new Date().toISOString(),
        metadata: metadata || {},
      }, { onConflict: 'id' });

    if (error) {
      console.error('[scraping/register] DB Error:', error);
      return NextResponse.json({ error: 'Failed to register worker' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/register] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
