import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST: 동기화 작업 취소
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, clinicId } = body;

    if (!jobId || !clinicId) {
      return NextResponse.json(
        { error: 'jobId, clinicId가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 해당 clinic의 job인지 확인
    const { data: job } = await supabase
      .from('scraping_jobs')
      .select('id, status, clinic_id')
      .eq('id', jobId)
      .eq('clinic_id', clinicId)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!['pending', 'running'].includes(job.status)) {
      return NextResponse.json(
        { error: '이미 완료되었거나 취소된 작업입니다.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: '사용자가 취소했습니다.',
      })
      .eq('id', jobId);

    if (error) {
      console.error('Job 취소 실패:', error);
      return NextResponse.json({ error: '작업 취소에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/hometax/sync/cancel error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
