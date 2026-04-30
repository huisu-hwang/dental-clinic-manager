import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// GET: 대기 중인 Job 조회 및 running으로 변경
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workerId = request.nextUrl.searchParams.get('workerId') || null;

    // pending 상태 job 1개 조회 (priority, created_at 순)
    const { data: job, error } = await admin
      .from('scraping_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !job) {
      return NextResponse.json({ job: null });
    }

    // status를 'running'으로 변경 (낙관적 락)
    const { error: updateError } = await admin
      .from('scraping_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        worker_id: workerId,
      })
      .eq('id', job.id)
      .eq('status', 'pending'); // 다른 워커가 먼저 가져가지 않았는지 확인

    if (updateError) {
      // 다른 워커가 먼저 가져간 경우
      return NextResponse.json({ job: null });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        clinic_id: job.clinic_id,
        data_types: job.data_types,
        target_year: job.target_year,
        target_month: job.target_month,
        target_date: job.target_date,
        priority: job.priority,
        retry_count: job.retry_count,
        created_at: job.created_at,
      },
    });
  } catch (error) {
    console.error('[worker-api/scraping/jobs GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
