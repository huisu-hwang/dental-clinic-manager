import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { type, ...payload } = body as { type: string; [key: string]: unknown };

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    if (type === 'keyword_analysis') {
      const { error } = await admin
        .from('seo_keyword_analyses')
        .upsert(payload, { onConflict: 'id' });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (type === 'analyzed_post') {
      const { error } = await admin
        .from('seo_analyzed_posts')
        .insert(payload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (type === 'compare_result') {
      const { error } = await admin
        .from('seo_compare_results')
        .upsert(payload, { onConflict: 'id' });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (type === 'update_analysis_status') {
      const { id, status, ...rest } = payload as { id: string; status: string; [key: string]: unknown };
      if (!id || !status) {
        return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
      }
      const { error } = await admin
        .from('seo_keyword_analyses')
        .update({ status, ...rest })
        .eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error('[worker-api/seo/data POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
