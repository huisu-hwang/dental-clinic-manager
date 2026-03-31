import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { jobs } = body;

    if (!jobs || !Array.isArray(jobs)) {
      return NextResponse.json({ error: 'Invalid jobs payload' }, { status: 400 });
    }

    let insertedCount = 0;

    for (const job of jobs) {
      // 중복 체크 (daily_sync, monthly_sync 특화)
      if (job.job_type === 'daily_sync' && job.target_date) {
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await admin
          .from('scraping_jobs')
          .select('id')
          .eq('clinic_id', job.clinic_id)
          .eq('job_type', 'daily_sync')
          .eq('target_date', job.target_date)
          .gte('created_at', `${today}T00:00:00`)
          .limit(1)
          .single();
        if (existing) continue;
      } else if (job.job_type === 'monthly_settlement' && job.target_year && job.target_month) {
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await admin
          .from('scraping_jobs')
          .select('id')
          .eq('clinic_id', job.clinic_id)
          .eq('job_type', 'monthly_settlement')
          .eq('target_year', job.target_year)
          .eq('target_month', job.target_month)
          .gte('created_at', `${today}T00:00:00`)
          .limit(1)
          .single();
        if (existing) continue;
      }

      const { error } = await admin.from('scraping_jobs').insert(job);
      if (error) {
        console.error('[scraping/jobs/create] DB Insert Error:', error);
      } else {
        insertedCount++;
      }
    }

    return NextResponse.json({ success: true, count: insertedCount });
  } catch (error) {
    console.error('[scraping/jobs/create] Internal Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
