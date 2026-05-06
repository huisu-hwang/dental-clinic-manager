import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// 워커 → 대시보드 SEO 결과 저장 라우트
// 워커는 항상 { type, data: {...} } 봉투(envelope) 형태로 전송
// (seo-bridge.ts의 client.saveData 참조)
//
// 각 타입별로 data를 풀어 적절한 테이블에 매핑한다.
// analyzed_post의 analysis_id는 워커가 보낸 keyword/job_id로 자동 조회.

type SeoDataBody = {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

async function findAnalysisId(
  admin: NonNullable<Awaited<ReturnType<typeof verifyWorkerApiKey>>>,
  opts: { jobId?: string; keyword?: string }
): Promise<string | null> {
  if (opts.jobId) {
    const { data } = await admin
      .from('seo_keyword_analyses')
      .select('id')
      .eq('job_id', opts.jobId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (opts.keyword) {
    const { data } = await admin
      .from('seo_keyword_analyses')
      .select('id')
      .eq('keyword', opts.keyword)
      .in('status', ['analyzing', 'running'])
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as SeoDataBody;
    const { type } = body;
    const data = (body.data || {}) as Record<string, unknown>;

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    if (type === 'keyword_analysis') {
      // 새 분석 레코드 생성 (또는 같은 job_id면 update)
      const keyword = data.keyword as string | undefined;
      const status = (data.status as string | undefined) || 'analyzing';
      const job_id = data.job_id as string | undefined;
      const analyzed_by = data.analyzed_by as string | undefined;

      if (!keyword) {
        return NextResponse.json({ error: 'data.keyword is required' }, { status: 400 });
      }

      if (job_id) {
        const existingId = await findAnalysisId(admin, { jobId: job_id });
        if (existingId) {
          const { error } = await admin
            .from('seo_keyword_analyses')
            .update({ keyword, status, analyzed_by, analyzed_at: new Date().toISOString() })
            .eq('id', existingId);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ ok: true, id: existingId });
        }
      }

      const { data: created, error } = await admin
        .from('seo_keyword_analyses')
        .insert({
          keyword,
          status,
          job_id,
          analyzed_by,
          analyzed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: created.id });
    }

    if (type === 'analyzed_post') {
      // analyzed_posts는 analysis_id (FK)가 필수.
      // 워커는 keyword/job_id를 함께 보내므로 그걸로 가장 최근 analyzing 분석을 찾아 매핑.
      const keyword = data.keyword as string | undefined;
      const job_id = data.job_id as string | undefined;
      let analysisId = (data.analysis_id as string | undefined) || null;

      if (!analysisId) {
        analysisId = await findAnalysisId(admin, { jobId: job_id, keyword });
      }
      if (!analysisId) {
        return NextResponse.json(
          { error: 'analysis_id를 찾을 수 없음 (keyword_analysis 레코드가 먼저 필요)' },
          { status: 400 }
        );
      }

      // 비-스키마 필드 제거 (keyword/job_id는 analyzed_posts 테이블에 없음)
      const { keyword: _kw, job_id: _jid, analysis_id: _aid, ...insertData } = data;

      const { error } = await admin
        .from('seo_analyzed_posts')
        .insert({ ...insertData, analysis_id: analysisId });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (type === 'update_analysis_status') {
      const id = data.id as string | undefined;
      const job_id = data.job_id as string | undefined;
      const keyword = data.keyword as string | undefined;
      const status = data.status as string | undefined;
      const summary = data.summary as Record<string, unknown> | undefined;
      // post_count는 seo_keyword_analyses 테이블에 없는 컬럼 — 무시 (또는 summary에 병합)

      if (!status) {
        return NextResponse.json({ error: 'data.status is required' }, { status: 400 });
      }

      const analysisId = id || (await findAnalysisId(admin, { jobId: job_id, keyword }));
      if (!analysisId) {
        return NextResponse.json({ error: 'analysis 레코드를 찾을 수 없음' }, { status: 404 });
      }

      const updatePayload: Record<string, unknown> = { status };
      if (summary) updatePayload.summary = summary;

      const { error } = await admin
        .from('seo_keyword_analyses')
        .update(updatePayload)
        .eq('id', analysisId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (type === 'compare_result') {
      const { error } = await admin
        .from('seo_compare_results')
        .insert(data);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error('[worker-api/seo/data POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
