import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const jobId = (await params).id;
    const body = await request.json();
    const { status, resultSummary, errorMessage, errorDetails } = body;

    if (status === 'completed') {
      const { error } = await admin
        .from('scraping_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_summary: resultSummary || {},
        })
        .eq('id', jobId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    } else if (status === 'failed') {
      // 재시도 여부 판단을 위해 현재 retry_count 조회
      const { data: job } = await admin
        .from('scraping_jobs')
        .select('retry_count, max_retries')
        .eq('id', jobId)
        .single();

      const retryCount = (job?.retry_count ?? 0) + 1;
      const maxRetries = job?.max_retries ?? 3;
      const shouldRetry = retryCount < maxRetries;

      const { error } = await admin
        .from('scraping_jobs')
        .update({
          status: shouldRetry ? 'pending' : 'failed',
          error_message: errorMessage || 'Unknown error',
          error_details: errorDetails || null,
          retry_count: retryCount,
          worker_id: null,
          completed_at: shouldRetry ? null : new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;
      return NextResponse.json({ success: true, retrying: shouldRetry });
    }

    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  } catch (error) {
    console.error('[scraping/jobs/result]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
