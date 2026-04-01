import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: jobs } = await admin
      .from('seo_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ job: null });
    }

    const job = jobs[0];

    await admin
      .from('seo_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id);

    return NextResponse.json({ job });
  } catch (error) {
    console.error('[worker-api/seo/jobs GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
