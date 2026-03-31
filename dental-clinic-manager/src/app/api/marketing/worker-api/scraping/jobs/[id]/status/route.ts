import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// POST: Job 상태 업데이트
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { status, result, error: errorMessage, retry } = body as {
      status: 'completed' | 'failed';
      result?: Record<string, unknown>;
      error?: string;
      retry?: boolean;
    };

    if (!status || !['completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (status === 'completed') {
      const { error } = await admin
        .from('scraping_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: result ?? null,
        })
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: 'Update failed: ' + error.message }, { status: 500 });
      }
    } else if (status === 'failed') {
      if (retry) {
        // 재시도: retry_count++ 후 pending으로 되돌림
        const { data: job } = await admin
          .from('scraping_jobs')
          .select('retry_count')
          .eq('id', id)
          .single();

        const { error } = await admin
          .from('scraping_jobs')
          .update({
            status: 'pending',
            retry_count: (job?.retry_count ?? 0) + 1,
            error_message: errorMessage ?? null,
          })
          .eq('id', id);

        if (error) {
          return NextResponse.json({ error: 'Update failed: ' + error.message }, { status: 500 });
        }
      } else {
        // 최종 실패
        const { error } = await admin
          .from('scraping_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: errorMessage ?? null,
          })
          .eq('id', id);

        if (error) {
          return NextResponse.json({ error: 'Update failed: ' + error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/scraping/jobs/[id]/status POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
