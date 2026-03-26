import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await admin
      .from('marketing_worker_control')
      .upsert({ id: 'main' }, { onConflict: 'id', ignoreDuplicates: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/init]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
