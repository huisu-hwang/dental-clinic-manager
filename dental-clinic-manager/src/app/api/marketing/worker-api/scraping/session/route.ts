import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// POST: 세션 쿠키 저장
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, sessionData } = body as {
      clinicId: string;
      sessionData: Record<string, unknown>;
    };

    if (!clinicId || !sessionData) {
      return NextResponse.json({ error: 'Missing clinicId or sessionData' }, { status: 400 });
    }

    // session_expires_at = now + 1시간
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error } = await admin
      .from('hometax_credentials')
      .update({
        session_data: sessionData,
        session_expires_at: expiresAt,
      })
      .eq('clinic_id', clinicId);

    if (error) {
      console.error('[worker-api/scraping/session] update error:', error);
      return NextResponse.json({ error: 'Session save failed: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expiresAt });
  } catch (error) {
    console.error('[worker-api/scraping/session POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
