import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function checkMasterAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || !['master_admin', 'admin'].includes(userData.role)) return null;
  return user;
}

// POST: 경쟁 비교 잡 생성
export async function POST(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json();
    const { keyword, myPostUrl } = body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    if (!myPostUrl || typeof myPostUrl !== 'string' || !myPostUrl.includes('blog.naver.com')) {
      return NextResponse.json({ error: '유효한 네이버 블로그 URL을 입력해주세요.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // 잡 생성
    const { data: job, error: jobError } = await admin
      .from('seo_jobs')
      .insert({
        job_type: 'competitor_compare',
        status: 'pending',
        params: { keyword: keyword.trim(), myPostUrl: myPostUrl.trim() },
        created_by: user.id,
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: `잡 생성 실패: ${jobError?.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: '비교 분석 잡이 생성되었습니다.',
    });

  } catch (err) {
    console.error('[SEO Compare] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// GET: 비교 결과 조회
export async function GET(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const compareId = searchParams.get('compareId');

    // 특정 잡 상태 조회
    if (jobId) {
      const { data: job } = await admin
        .from('seo_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다.' }, { status: 404 });

      let compareResult = null;
      if (job.status === 'completed') {
        const { data } = await admin
          .from('seo_compare_results')
          .select('*')
          .eq('job_id', jobId)
          .single();
        compareResult = data;
      }

      return NextResponse.json({ success: true, job, compareResult });
    }

    // 특정 비교 결과 조회
    if (compareId) {
      const { data: result } = await admin
        .from('seo_compare_results')
        .select('*')
        .eq('id', compareId)
        .single();

      return NextResponse.json({ success: true, result });
    }

    // 최근 비교 목록
    const { data: results } = await admin
      .from('seo_compare_results')
      .select('id, keyword, my_post_url, overall_score, analyzed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ success: true, results: results || [] });

  } catch (err) {
    console.error('[SEO Compare GET] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
