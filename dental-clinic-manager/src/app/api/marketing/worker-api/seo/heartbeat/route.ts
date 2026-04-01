import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { worker_id, status } = body as { worker_id: string; status: string };

    if (!worker_id || !status) {
      return NextResponse.json({ error: 'worker_id and status are required' }, { status: 400 });
    }

    const { error } = await admin
      .from('seo_workers')
      .upsert(
        {
          worker_name: worker_id,
          status,
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: 'worker_name' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check if stop has been requested for this worker
    const { data: workerRow } = await admin
      .from('seo_workers')
      .select('stop_requested')
      .eq('worker_name', worker_id)
      .single();

    return NextResponse.json({
      ok: true,
      stop_requested: workerRow?.stop_requested ?? false,
    });
  } catch (error) {
    console.error('[worker-api/seo/heartbeat POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
