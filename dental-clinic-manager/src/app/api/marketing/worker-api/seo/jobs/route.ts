import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // pending 잡 조회
    const { data: jobs } = await admin
      .from('seo_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    // running 잡 수 조회 (상태 표시용)
    const { count: runningCount } = await admin
      .from('seo_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running');

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ job: null, runningCount: runningCount || 0 });
    }

    const job = jobs[0];

    await admin
      .from('seo_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id);

    return NextResponse.json({ job, runningCount: (runningCount || 0) + 1 });
  } catch (error) {
    console.error('[worker-api/seo/jobs GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
