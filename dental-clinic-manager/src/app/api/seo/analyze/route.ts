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

// POST: 키워드 분석 잡 생성
export async function POST(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json();
    const { keyword } = body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // 24시간 내 동일 키워드 분석이 있는지 확인
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from('seo_keyword_analyses')
      .select('id, status, analyzed_at')
      .eq('keyword', keyword.trim())
      .gte('created_at', oneDayAgo)
      .in('status', ['pending', 'collecting', 'analyzing_quantitative', 'analyzing_qualitative', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const recent = existing[0];
      if (recent.status === 'completed') {
        return NextResponse.json({
          success: true,
          cached: true,
          analysisId: recent.id,
          message: '24시간 내 동일 키워드 분석 결과가 있습니다.',
        });
      }
      if (['pending', 'collecting', 'analyzing_quantitative', 'analyzing_qualitative'].includes(recent.status)) {
        return NextResponse.json({
          success: true,
          inProgress: true,
          analysisId: recent.id,
          message: '이미 분석이 진행 중입니다.',
        });
      }
    }

    // 잡 생성
    const { data: job, error: jobError } = await admin
      .from('seo_jobs')
      .insert({
        job_type: 'keyword_analysis',
        status: 'pending',
        params: { keyword: keyword.trim() },
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
      message: '분석 잡이 생성되었습니다. 워커가 처리합니다.',
    });

  } catch (err) {
    console.error('[SEO Analyze] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// GET: 분석 상태/결과 조회
export async function GET(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const analysisId = searchParams.get('analysisId');

    // 특정 잡 상태 조회
    if (jobId) {
      const { data: job } = await admin
        .from('seo_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (!job) return NextResponse.json({ error: '잡을 찾을 수 없습니다.' }, { status: 404 });

      // 연관된 분석 결과 조회
      let analysis = null;
      if (job.status === 'completed' || job.status === 'running') {
        const { data } = await admin
          .from('seo_keyword_analyses')
          .select('*')
          .eq('job_id', jobId)
          .single();
        analysis = data;
      }

      return NextResponse.json({ success: true, job, analysis });
    }

    // 특정 분석 결과 상세 조회
    if (analysisId) {
      const { data: analysis } = await admin
        .from('seo_keyword_analyses')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (!analysis) return NextResponse.json({ error: '분석 결과를 찾을 수 없습니다.' }, { status: 404 });

      const { data: posts } = await admin
        .from('seo_analyzed_posts')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('rank', { ascending: true });

      return NextResponse.json({ success: true, analysis, posts: posts || [] });
    }

    // 최근 분석 목록
    const { data: analyses } = await admin
      .from('seo_keyword_analyses')
      .select('id, keyword, status, analyzed_at, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ success: true, analyses: analyses || [] });

  } catch (err) {
    console.error('[SEO Analyze GET] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
