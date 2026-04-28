import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { extractKeywordsFromPosts } from '@/lib/marketing/seo-text-miner';
import type { SeoKeywordMiningResult } from '@/types/marketing';

// 글 작성 전 SEO 분석 미리보기
// - 워커가 이미 분석한 결과(24h 캐시)가 있으면 즉시 반환
// - 없으면 seo_jobs 등록 후 최대 60초 폴링 (워커가 분석 중이면 inProgress 응답)
// - 결과는 SeoKeywordMiningResult 형식 (avgBodyLength/avgImageCount 등)으로 반환

export const maxDuration = 90;

interface AnalysisRow {
  id: string;
  status: string;
  summary: { textMining?: SeoKeywordMiningResult } | null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const keyword: string = (body?.keyword || '').toString().trim();
    if (!keyword) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1) 24시간 내 완료된 분석 우선 조회
    const { data: completed } = await admin
      .from('seo_keyword_analyses')
      .select('id, status, summary')
      .eq('keyword', keyword)
      .eq('status', 'completed')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    let analysis: AnalysisRow | null = (completed?.[0] as AnalysisRow) || null;

    // 2) 진행 중인 분석 조회
    if (!analysis) {
      const { data: inProgress } = await admin
        .from('seo_keyword_analyses')
        .select('id, status, summary')
        .eq('keyword', keyword)
        .gte('created_at', oneDayAgo)
        .in('status', ['pending', 'collecting', 'analyzing_quantitative', 'analyzing_qualitative'])
        .order('created_at', { ascending: false })
        .limit(1);
      analysis = (inProgress?.[0] as AnalysisRow) || null;
    }

    // 3) 둘 다 없으면 새 잡 생성
    if (!analysis) {
      const { error: jobError } = await admin
        .from('seo_jobs')
        .insert({
          job_type: 'keyword_analysis',
          status: 'pending',
          params: { keyword },
          created_by: user.id,
        });
      if (jobError) {
        return NextResponse.json({ error: `잡 생성 실패: ${jobError.message}` }, { status: 500 });
      }
    }

    // 4) 최대 60초간 5초 간격 폴링 (워커가 SEO 워커인 경우 시간 소요)
    const POLL_MAX = 12;
    const POLL_INTERVAL_MS = 5000;
    for (let i = 0; i < POLL_MAX; i++) {
      const { data: check } = await admin
        .from('seo_keyword_analyses')
        .select('id, status, summary')
        .eq('keyword', keyword)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(1);
      const row = (check?.[0] as AnalysisRow | undefined);
      if (row?.status === 'completed') {
        analysis = row;
        break;
      }
      if (row?.status === 'failed') {
        return NextResponse.json({ error: '분석 작업이 실패했습니다.', status: 'failed' }, { status: 502 });
      }
      // 아직 진행중 → 대기
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!analysis || analysis.status !== 'completed') {
      return NextResponse.json(
        { status: 'pending', message: '분석이 진행 중입니다. 잠시 후 다시 시도해주세요.' },
        { status: 202 }
      );
    }

    // 5) 캐시된 textMining 우선 사용, 없으면 on-the-fly 계산
    let textMining: SeoKeywordMiningResult | null = analysis.summary?.textMining || null;
    if (!textMining) {
      const { data: posts } = await admin
        .from('seo_analyzed_posts')
        .select('body_text, title, tags, body_length, image_count, heading_count, keyword_count')
        .eq('analysis_id', analysis.id)
        .order('rank', { ascending: true });
      if (posts && posts.length > 0) {
        textMining = extractKeywordsFromPosts(posts, keyword);
      }
    }

    if (!textMining) {
      return NextResponse.json({ error: '분석 결과를 추출할 수 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      status: 'completed',
      analysisId: analysis.id,
      data: textMining,
    });
  } catch (err) {
    console.error('[SEO Preview] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
