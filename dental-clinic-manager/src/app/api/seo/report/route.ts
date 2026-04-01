import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function checkAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// POST: 종합 보고서 생성
export async function POST(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json();
    const { analysisIds, title } = body;

    if (!analysisIds || !Array.isArray(analysisIds) || analysisIds.length === 0) {
      return NextResponse.json({ error: '분석 결과를 선택해주세요.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // 선택한 분석들의 포스트 데이터 조회
    const { data: posts } = await admin
      .from('seo_analyzed_posts')
      .select('*')
      .in('analysis_id', analysisIds);

    if (!posts || posts.length === 0) {
      return NextResponse.json({ error: '분석 데이터가 없습니다.' }, { status: 404 });
    }

    const { data: analyses } = await admin
      .from('seo_keyword_analyses')
      .select('id, keyword, summary')
      .in('id', analysisIds);

    // 종합 통계 계산
    const aggregatedSummary = calculateAggregatedSummary(posts);

    // 공통 패턴 도출
    const commonPatterns = deriveCommonPatterns(posts, aggregatedSummary);

    // 권장 사항 생성
    const recommendations = generateRecommendations(aggregatedSummary);

    const reportContent = {
      overview: `총 ${analyses?.length || 0}개 키워드, ${posts.length}개 상위 노출 글을 분석했습니다.`,
      keywords: analyses?.map((a) => a.keyword) || [],
      quantitativeInsights: generateQuantitativeInsights(aggregatedSummary),
      qualitativeInsights: generateQualitativeInsights(posts),
      commonPatterns,
      recommendations,
      aggregatedSummary,
    };

    // 보고서 저장
    const { data: report, error: saveError } = await admin
      .from('seo_reports')
      .insert({
        title: title || `SEO 종합 보고서 (${new Date().toLocaleDateString('ko-KR')})`,
        analysis_ids: analysisIds,
        total_keywords: analyses?.length || 0,
        total_posts: posts.length,
        report_content: reportContent,
        generated_by: user.id,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: `보고서 저장 실패: ${saveError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, report });

  } catch (err) {
    console.error('[SEO Report] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// GET: 보고서 목록/상세 조회
export async function GET(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');

    if (reportId) {
      const { data: report } = await admin
        .from('seo_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      return NextResponse.json({ success: true, report });
    }

    const { data: reports } = await admin
      .from('seo_reports')
      .select('id, title, total_keywords, total_posts, generated_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ success: true, reports: reports || [] });

  } catch (err) {
    console.error('[SEO Report GET] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// --- 보고서 생성 유틸리티 ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateAggregatedSummary(posts: any[]) {
  const numericFields = [
    'title_length', 'body_length', 'image_count', 'video_count',
    'keyword_count', 'heading_count', 'paragraph_count',
    'external_link_count', 'internal_link_count', 'comment_count',
    'like_count', 'tag_count',
  ];

  const summary: Record<string, { avg: number; median: number; min: number; max: number }> = {};

  for (const field of numericFields) {
    const values = posts.map((p) => Number(p[field]) || 0).sort((a, b) => a - b);
    if (values.length === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

    summary[field] = {
      avg: Math.round((sum / values.length) * 10) / 10,
      median: Math.round(median * 10) / 10,
      min: values[0],
      max: values[values.length - 1],
    };
  }

  return summary;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveCommonPatterns(posts: any[], summary: Record<string, any>): string[] {
  const patterns: string[] = [];

  // 키워드 위치
  const frontCount = posts.filter((p) => p.keyword_position === 'front').length;
  const frontRate = Math.round((frontCount / posts.length) * 100);
  if (frontRate >= 60) {
    patterns.push(`상위 글의 ${frontRate}%가 제목 앞부분에 키워드를 배치합니다.`);
  }

  // 본문 길이
  if (summary.body_length) {
    patterns.push(`평균 본문 길이는 ${Math.round(summary.body_length.avg).toLocaleString()}자입니다.`);
  }

  // 이미지
  if (summary.image_count) {
    patterns.push(`평균 이미지 ${Math.round(summary.image_count.avg)}개를 사용합니다.`);
  }

  // 구조화
  const structureCount = posts.filter((p) => p.has_structure).length;
  const structureRate = Math.round((structureCount / posts.length) * 100);
  if (structureRate >= 50) {
    patterns.push(`${structureRate}%가 서론-본론-결론 구조를 갖추고 있습니다.`);
  }

  // 경험/후기
  const expHighCount = posts.filter((p) => p.experience_level === 'high').length;
  const expRate = Math.round((expHighCount / posts.length) * 100);
  if (expRate >= 40) {
    patterns.push(`${expRate}%가 높은 수준의 실제 경험/후기를 포함합니다.`);
  }

  // 동영상
  const videoCount = posts.filter((p) => p.has_video).length;
  const videoRate = Math.round((videoCount / posts.length) * 100);
  if (videoRate >= 30) {
    patterns.push(`${videoRate}%가 동영상을 포함합니다.`);
  }

  return patterns;
}

function generateRecommendations(summary: Record<string, { avg: number; median: number; min: number; max: number }>): string[] {
  const recs: string[] = [];

  if (summary.body_length) {
    recs.push(`본문은 최소 ${Math.round(summary.body_length.median).toLocaleString()}자 이상 작성하세요 (상위 중앙값 기준).`);
  }
  if (summary.image_count) {
    recs.push(`이미지는 ${Math.round(summary.image_count.median)}개 이상 삽입하세요. 직접 촬영한 최신 이미지가 효과적입니다.`);
  }
  recs.push('제목 앞부분에 핵심 키워드를 배치하고, 15~25자 내외로 작성하세요.');
  recs.push('본문에 키워드를 3~5회 자연스럽게 포함시키세요.');
  if (summary.heading_count && summary.heading_count.avg >= 2) {
    recs.push(`소제목을 ${Math.round(summary.heading_count.median)}개 이상 사용하여 글을 구조화하세요.`);
  }
  recs.push('실제 경험과 구체적 사례를 포함하여 D.I.A. 점수를 높이세요.');

  return recs;
}

function generateQuantitativeInsights(summary: Record<string, { avg: number; median: number; min: number; max: number }>): string {
  const lines: string[] = ['## 정량 지표 분석\n'];

  const fieldNames: Record<string, string> = {
    title_length: '제목 글자수',
    body_length: '본문 글자수',
    image_count: '이미지 수',
    video_count: '동영상 수',
    keyword_count: '키워드 반복',
    heading_count: '소제목 수',
    paragraph_count: '문단 수',
    external_link_count: '외부 링크',
    internal_link_count: '내부 링크',
    comment_count: '댓글 수',
    like_count: '공감 수',
    tag_count: '태그 수',
  };

  for (const [field, name] of Object.entries(fieldNames)) {
    const s = summary[field];
    if (s) {
      lines.push(`- **${name}**: 평균 ${s.avg}, 중앙값 ${s.median}, 범위 ${s.min}~${s.max}`);
    }
  }

  return lines.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateQualitativeInsights(posts: any[]): string {
  const total = posts.length;
  if (total === 0) return '';

  const lines: string[] = ['## 정성 지표 분석\n'];

  const expDist = countDist(posts.map((p) => p.experience_level));
  lines.push(`- **경험/후기**: 상 ${pct(expDist.high, total)}, 중 ${pct(expDist.medium, total)}, 하 ${pct(expDist.low, total)}`);

  const origDist = countDist(posts.map((p) => p.originality_level));
  lines.push(`- **독창성**: 상 ${pct(origDist.high, total)}, 중 ${pct(origDist.medium, total)}, 하 ${pct(origDist.low, total)}`);

  const readDist = countDist(posts.map((p) => p.readability_level));
  lines.push(`- **가독성**: 상 ${pct(readDist.high, total)}, 중 ${pct(readDist.medium, total)}, 하 ${pct(readDist.low, total)}`);

  const purposeDist = countDist(posts.map((p) => p.content_purpose));
  lines.push(`- **글 목적**: 정보제공 ${pct(purposeDist.info, total)}, 후기 ${pct(purposeDist.review, total)}, 광고 ${pct(purposeDist.ad, total)}`);

  const toneDist = countDist(posts.map((p) => p.tone));
  lines.push(`- **톤/어조**: 친근 ${pct(toneDist.casual, total)}, 정보전달 ${pct(toneDist.informative, total)}, 전문적 ${pct(toneDist.professional, total)}`);

  return lines.join('\n');
}

function countDist(values: string[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const v of values) {
    if (v) dist[v] = (dist[v] || 0) + 1;
  }
  return dist;
}

function pct(count: number | undefined, total: number): string {
  return `${Math.round(((count || 0) / total) * 100)}%`;
}
