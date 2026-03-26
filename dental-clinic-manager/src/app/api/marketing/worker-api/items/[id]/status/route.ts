import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const update: Record<string, unknown> = { status: body.status };

    if (body.fail_reason !== undefined) update.fail_reason = body.fail_reason;
    if (body.published_urls !== undefined) update.published_urls = body.published_urls;

    await admin
      .from('content_calendar_items')
      .update(update)
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/items/status]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
