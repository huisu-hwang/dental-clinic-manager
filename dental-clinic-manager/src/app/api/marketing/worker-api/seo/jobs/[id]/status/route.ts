import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

const MAX_RETRIES = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { status, result, error_message } = body as {
      status: 'completed' | 'failed';
      result?: object;
      error_message?: string;
    };

    if (!['completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (status === 'completed') {
      await admin
        .from('seo_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: result ?? null,
        })
        .eq('id', id);

      return NextResponse.json({ ok: true });
    }

    // failed: check retry count
    const { data: job } = await admin
      .from('seo_jobs')
      .select('retry_count')
      .eq('id', id)
      .single();

    const retryCount = (job?.retry_count ?? 0) + 1;

    if (retryCount < MAX_RETRIES) {
      await admin
        .from('seo_jobs')
        .update({
          status: 'pending',
          retry_count: retryCount,
          error_message: error_message ?? null,
        })
        .eq('id', id);
    } else {
      await admin
        .from('seo_jobs')
        .update({
          status: 'failed',
          retry_count: retryCount,
          error_message: error_message ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/seo/jobs/[id]/status POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
