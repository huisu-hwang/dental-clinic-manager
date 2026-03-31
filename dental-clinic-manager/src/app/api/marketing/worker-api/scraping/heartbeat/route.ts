import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// POST: 워커 heartbeat
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { workerId, status, currentJobId } = body as {
      workerId: string;
      status: 'online' | 'busy';
      currentJobId?: string;
    };

    if (!workerId || !status) {
      return NextResponse.json({ error: 'Missing workerId or status' }, { status: 400 });
    }

    // scraping_workers upsert (last_heartbeat, status, current_job_id 업데이트)
    const { data: workerData, error } = await admin
      .from('scraping_workers')
      .upsert(
        {
          id: workerId,
          status,
          current_job_id: currentJobId ?? null,
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('stop_requested')
      .single();

    if (error) {
      console.error('[worker-api/scraping/heartbeat] upsert error:', error);
      return NextResponse.json({ error: 'Heartbeat update failed: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      stopRequested: workerData?.stop_requested ?? false,
    });
  } catch (error) {
    console.error('[worker-api/scraping/heartbeat POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
