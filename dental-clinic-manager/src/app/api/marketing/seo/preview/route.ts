import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { extractKeywordsFromPosts } from '@/lib/marketing/seo-text-miner';
import type { SeoKeywordMiningResult } from '@/types/marketing';

// 글 작성 전 SEO 분석 미리보기
// - POST: 즉시 응답 (캐시 결과 또는 큐 상태). stale 잡(5분+ running)은 자동 fail 처리 후 재큐잉
// - GET: 클라이언트가 폴링하며 status / progress / data를 받아 진행률 UI를 그림

export const maxDuration = 30;

// 5분 이상 running 상태로 멈춰있으면 stale로 간주 (워커 비정상 종료 추정)
const STALE_RUNNING_MS = 5 * 60 * 1000;

interface JobRow {
  id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  error_message: string | null;
}

interface AnalysisRow {
  id: string;
  status: string;
  summary: { textMining?: SeoKeywordMiningResult } | null;
}

type PreviewStatus = 'completed' | 'pending' | 'running' | 'failed';

interface PreviewResponse {
  status: PreviewStatus;
  /** 0~100, 상태별 추정 진행률 */
  progress: number;
  /** 사용자에게 보여줄 단계 설명 */
  step: string;
  /** completed일 때만 채워짐 */
  data?: SeoKeywordMiningResult;
  /** 실패 시 사유 */
  error?: string;
  jobId?: string;
}

/** running 잡의 경과 시간으로 progress / step 추정 */
function estimateRunningProgress(startedAt: string | null): { progress: number; step: string } {
  if (!startedAt) return { progress: 15, step: '워커가 분석 작업을 시작하고 있습니다...' };
  const elapsed = Date.now() - new Date(startedAt).getTime();
  if (elapsed < 15_000) return { progress: 25, step: '네이버 상위 노출 글을 수집 중입니다...' };
  if (elapsed < 45_000) return { progress: 50, step: '경쟁 글 본문을 분석 중입니다...' };
  if (elapsed < 90_000) return { progress: 75, step: '핵심 키워드와 글 구조를 추출 중입니다...' };
  return { progress: 90, step: '거의 다 끝났습니다. 마무리 중...' };
}

/** 캐시된 완료 분석을 SeoKeywordMiningResult로 변환 (없으면 on-the-fly 계산) */
async function buildResultFromAnalysis(admin: ReturnType<typeof getSupabaseAdmin>, analysis: AnalysisRow, keyword: string): Promise<SeoKeywordMiningResult | null> {
  if (!admin) return null;
  if (analysis.summary?.textMining) return analysis.summary.textMining;
  const { data: posts } = await admin
    .from('seo_analyzed_posts')
    .select('body_text, title, tags, body_length, image_count, heading_count, keyword_count')
    .eq('analysis_id', analysis.id)
    .order('rank', { ascending: true });
  if (!posts || posts.length === 0) return null;
  return extractKeywordsFromPosts(posts, keyword);
}

/** 키워드의 현재 상태 조사 — POST/GET 공용 핵심 로직 */
async function resolvePreviewState(
  admin: ReturnType<typeof getSupabaseAdmin>,
  keyword: string,
  options: { autoRequeue: boolean; userId?: string }
): Promise<PreviewResponse> {
  if (!admin) return { status: 'failed', progress: 0, step: '서버 초기화 실패', error: 'Admin 클라이언트 사용 불가' };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1) 24h 내 완료된 분석 우선 확인
  const { data: completed } = await admin
    .from('seo_keyword_analyses')
    .select('id, status, summary')
    .eq('keyword', keyword)
    .eq('status', 'completed')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  const completedAnalysis: AnalysisRow | null = (completed?.[0] as AnalysisRow) || null;
  if (completedAnalysis) {
    const data = await buildResultFromAnalysis(admin, completedAnalysis, keyword);
    if (data) {
      return { status: 'completed', progress: 100, step: '분석 완료', data };
    }
  }

  // 2) 24h 내 가장 최근 잡 확인
  const { data: jobs } = await admin
    .from('seo_jobs')
    .select('id, status, started_at, created_at, error_message')
    .eq('job_type', 'keyword_analysis')
    .filter('params->>keyword', 'eq', keyword)
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  const latestJob = (jobs?.[0] as JobRow | undefined) || null;

  // 2-1) running 잡이 있는 경우
  if (latestJob && latestJob.status === 'running') {
    const startedAt = latestJob.started_at || latestJob.created_at;
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const isStale = elapsed > STALE_RUNNING_MS;

    if (isStale && options.autoRequeue) {
      // stale 잡을 failed로 마킹하고 새 잡 생성
      await admin
        .from('seo_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: latestJob.error_message || 'Worker timeout — auto-failed by preview API',
        })
        .eq('id', latestJob.id);
      // fallthrough → 새 잡 생성 단계로
    } else if (!isStale) {
      const { progress, step } = estimateRunningProgress(latestJob.started_at);
      return { status: 'running', progress, step, jobId: latestJob.id };
    } else {
      // stale인데 autoRequeue 비활성 (GET 호출) → running으로 그대로 반환하되 step에 안내
      return {
        status: 'running',
        progress: 90,
        step: '분석이 오래 걸리고 있습니다. 잠시 후 자동으로 재시도됩니다.',
        jobId: latestJob.id,
      };
    }
  }

  // 2-2) pending 잡이 있는 경우 (워커가 아직 픽업 안 함)
  if (latestJob && latestJob.status === 'pending') {
    return { status: 'pending', progress: 10, step: '워커가 잡을 픽업하기를 대기 중...', jobId: latestJob.id };
  }

  // 2-3) 가장 최근 잡이 failed면 새로 큐잉 시도
  // 2-4) 잡이 없거나 모두 종료된 상태면 새 잡 생성

  // 3) autoRequeue=true (POST)인 경우 새 잡 생성
  if (options.autoRequeue) {
    if (!options.userId) return { status: 'failed', progress: 0, step: '권한 없음', error: '인증 필요' };
    const { data: newJob, error: insertErr } = await admin
      .from('seo_jobs')
      .insert({
        job_type: 'keyword_analysis',
        status: 'pending',
        params: { keyword },
        created_by: options.userId,
      })
      .select('id')
      .single();
    if (insertErr || !newJob) {
      return { status: 'failed', progress: 0, step: '잡 생성 실패', error: insertErr?.message || 'unknown' };
    }
    return { status: 'pending', progress: 10, step: '워커에 분석 요청을 등록했습니다...', jobId: newJob.id };
  }

  // 4) autoRequeue=false (GET) — 잡 자체가 없는 상태
  if (latestJob && latestJob.status === 'failed') {
    return { status: 'failed', progress: 0, step: '분석에 실패했습니다.', error: latestJob.error_message || '워커 오류', jobId: latestJob.id };
  }
  return { status: 'failed', progress: 0, step: '분석 잡이 없습니다.', error: 'no active job' };
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
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    const result = await resolvePreviewState(admin, keyword, { autoRequeue: true, userId: user.id });
    // completed면 200, 그 외(진행 중)는 202, 실패면 502
    const httpStatus = result.status === 'completed' ? 200 : result.status === 'failed' ? 502 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    console.error('[SEO Preview POST] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get('keyword') || '').trim();
    if (!keyword) {
      return NextResponse.json({ error: '키워드 파라미터가 필요합니다.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // GET은 stale 잡을 자동 재큐잉하지 않음 (사용자 행동 없이 reqeue 방지)
    const result = await resolvePreviewState(admin, keyword, { autoRequeue: false });
    const httpStatus = result.status === 'completed' ? 200 : result.status === 'failed' ? 502 : 202;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    console.error('[SEO Preview GET] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
