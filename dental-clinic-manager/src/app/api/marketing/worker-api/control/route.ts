import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const update: Record<string, unknown> = { last_updated: new Date().toISOString() };

    if (body.watchdog_online !== undefined) update.watchdog_online = body.watchdog_online;
    if (body.worker_running !== undefined) update.worker_running = body.worker_running;
    if (body.clear_start_requested) update.start_requested = false;
    if (body.clear_stop_requested) update.stop_requested = false;

    await admin
      .from('marketing_worker_control')
      .update(update)
      .eq('id', 'main');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/control]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
