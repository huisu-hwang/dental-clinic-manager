import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { workerId } = body;

    // 1. pending 상태의 Job을 우선순위대로 하나 가져옴
    const { data: job, error: fetchError } = await admin
      .from('scraping_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ job: null });
    }

    // 2. status를 running으로 변경 (낙관적 락)
    const { data: updated, error: updateError } = await admin
      .from('scraping_jobs')
      .update({
        status: 'running',
        worker_id: workerId,
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateError || !updated) {
      // 경합 발생 (다른 워커가 가져감)
      return NextResponse.json({ job: null });
    }

    return NextResponse.json({ job: updated });
  } catch (error) {
    console.error('[scraping/jobs/acquire]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
