import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 동기화 상태 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const jobId = searchParams.get('jobId');

    if (!clinicId && !jobId) {
      return NextResponse.json({ error: 'clinicId 또는 jobId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    let job;

    if (jobId) {
      const { data, error } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        return NextResponse.json({ error: 'Job 조회에 실패했습니다.' }, { status: 500 });
      }
      job = data;
    } else {
      // 클리닉의 활성 Job 또는 최근 Job 조회
      const { data: activeJob } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('clinic_id', clinicId!)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activeJob) {
        // 2시간 이상 지연된 작업은 실패 처리 (워커 응답 없음)
        const jobDate = new Date(activeJob.created_at);
        const now = new Date();
        const diffHours = (now.getTime() - jobDate.getTime()) / (1000 * 60 * 60);

        if (diffHours > 2) {
          await supabase
            .from('scraping_jobs')
            .update({
              status: 'failed',
              error_message: '시간 초과로 인한 자동 실패 처리 (워커 응답 없음)'
            })
            .eq('id', activeJob.id);
          activeJob.status = 'failed';
          activeJob.error_message = '시간 초과로 인한 자동 실패 처리 (워커 응답 없음)';
        }
        job = activeJob;
      } else {
        const { data: recentJob, error } = await supabase
          .from('scraping_jobs')
          .select('*')
          .eq('clinic_id', clinicId!)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          return NextResponse.json({ error: 'Job 조회에 실패했습니다.' }, { status: 500 });
        }
        job = recentJob || null;
      }
    }

    if (!job) {
      return NextResponse.json({ success: true, data: null });
    }

    // 완료된 데이터 타입 수 조회 (hometax_raw_data에서)
    const { data: completedData } = await supabase
      .from('hometax_raw_data')
      .select('data_type')
      .eq('job_id', job.id);

    const completedTypes = [...new Set(completedData?.map((d: { data_type: string }) => d.data_type) || [])];

    return NextResponse.json({ success: true, data: { ...job, completedTypes } });
  } catch (error) {
    console.error('GET /api/hometax/sync/status error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
