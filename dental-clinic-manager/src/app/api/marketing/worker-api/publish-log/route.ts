import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // 1. 발행 로그 기록
    await admin.from('content_publish_logs').insert({
      item_id: body.item_id,
      platform: body.platform,
      status: body.status,
      published_url: body.published_url || null,
      error_message: body.error_message || null,
      duration_seconds: body.duration_seconds || null,
    });

    // 2. 키워드 이력 기록 (있는 경우)
    if (body.keyword && body.clinic_id) {
      const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
      await admin.from('keyword_publish_history').upsert({
        clinic_id: body.clinic_id,
        keyword: body.keyword,
        published_at: todayKst,
        item_id: body.item_id,
      }, { onConflict: 'clinic_id,keyword,published_at' });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/publish-log]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
