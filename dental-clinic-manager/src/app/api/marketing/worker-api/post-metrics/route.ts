// 발행 후 KPI 수집 — Worker가 스크래핑한 결과를 push
// POST: 단건 또는 배치 기록
// GET:  발행됨(published) + 7일 내 마지막 측정이 6시간 이상 지난 항목 목록
//       (Worker가 다음 측정 대상을 식별하기 위함)
import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

interface MetricsPayload {
  item_id: string;
  platform: string;            // 'naver_blog' 등
  views?: number;
  comments?: number;
  likes?: number;
  scraps?: number;
  shares?: number;
  raw_payload?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const items: MetricsPayload[] = Array.isArray(body) ? body : (body.items || [body]);

    if (items.length === 0) {
      return NextResponse.json({ error: 'metrics 항목 없음' }, { status: 400 });
    }

    // 기본 검증
    for (const m of items) {
      if (!m.item_id || !m.platform) {
        return NextResponse.json(
          { error: 'item_id, platform 필수' },
          { status: 400 }
        );
      }
    }

    const rows = items.map((m) => ({
      item_id: m.item_id,
      platform: m.platform,
      views: m.views ?? null,
      comments: m.comments ?? null,
      likes: m.likes ?? null,
      scraps: m.scraps ?? null,
      shares: m.shares ?? null,
      raw_payload: m.raw_payload || null,
    }));

    const { error } = await admin.from('content_post_metrics').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (error) {
    console.error('[worker-api/post-metrics POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 측정 대상 큐: published + (7일 내 발행 OR 마지막 측정 ≥ 6시간 전)
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    // 기준일: 14일 내 발행된 글까지 측정
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const { data: items, error } = await admin
      .from('content_calendar_items')
      .select('id, title, publish_date, published_urls, platforms, calendar_id')
      .eq('status', 'published')
      .gte('publish_date', cutoff.toISOString().split('T')[0])
      .order('publish_date', { ascending: false })
      .limit(limit * 2); // 후처리 필터를 위한 여유

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 각 항목의 마지막 측정 시각 조회 → 6시간 이상 지난 것만 필터
    const itemIds = (items || []).map((i) => i.id as string);
    const { data: latestRows } = await admin
      .from('content_post_metrics')
      .select('item_id, measured_at')
      .in('item_id', itemIds)
      .order('measured_at', { ascending: false });

    const lastMeasured = new Map<string, Date>();
    for (const r of latestRows || []) {
      const id = r.item_id as string;
      if (!lastMeasured.has(id)) {
        lastMeasured.set(id, new Date(r.measured_at as string));
      }
    }

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const queue = (items || [])
      .filter((it) => {
        const last = lastMeasured.get(it.id as string);
        return !last || last < sixHoursAgo;
      })
      .slice(0, limit)
      .map((it) => ({
        id: it.id as string,
        title: it.title as string,
        publish_date: it.publish_date as string,
        published_urls: it.published_urls as Record<string, string> | null,
        platforms: it.platforms as Record<string, boolean> | null,
        last_measured_at: lastMeasured.get(it.id as string)?.toISOString() || null,
      }));

    return NextResponse.json({ queue, total: queue.length });
  } catch (error) {
    console.error('[worker-api/post-metrics GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
