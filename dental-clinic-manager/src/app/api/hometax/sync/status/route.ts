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

    if (jobId) {
      // 특정 Job 상태 조회
      const { data, error } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        return NextResponse.json({ error: 'Job 조회에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // 클리닉의 최근 Job 상태 조회
    const { data, error } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('clinic_id', clinicId!)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Job 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || null });
  } catch (error) {
    console.error('GET /api/hometax/sync/status error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
