import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const jobId = (await params).id;
    const body = await request.json();
    const { progressMessage } = body;

    const { error } = await admin
      .from('scraping_jobs')
      .update({ progress_message: progressMessage })
      .eq('id', jobId);

    if (error) {
      console.error('[scraping/jobs/progress] DB Update Error:', error);
      return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[scraping/jobs/progress] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
