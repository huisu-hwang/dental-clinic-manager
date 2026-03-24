import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const WORKER_URL = process.env.MARKETING_WORKER_URL || 'http://localhost:3001';

// GET: 워커 상태 조회 (마케팅 워커, 스크래핑 워커)
// ?type=marketing | scraping | all (기본값: all)
export async function GET(request: NextRequest) {
  try {
    // 인증 확인 (일반 사용자도 조회 가능)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const result: {
      marketing?: { online: boolean };
      scraping?: { online: boolean; workerCount: number };
    } = {};

    // 마케팅 워커 상태
    if (type === 'marketing' || type === 'all') {
      let online = false;
      try {
        const res = await fetch(`${WORKER_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        online = res.ok;
      } catch {
        online = false;
      }
      result.marketing = { online };
    }

    // 스크래핑 워커 상태
    if (type === 'scraping' || type === 'all') {
      let online = false;
      let workerCount = 0;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: workers } = await admin
          .from('scraping_workers')
          .select('status, last_heartbeat')
          .order('last_heartbeat', { ascending: false });

        if (workers) {
          const onlineWorkers = workers.filter((w) => {
            if (w.status === 'offline') return false;
            const lastBeat = new Date(w.last_heartbeat);
            return Date.now() - lastBeat.getTime() < 2 * 60 * 1000;
          });
          workerCount = onlineWorkers.length;
          online = workerCount > 0;
        }
      }
      result.scraping = { online, workerCount };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] workers/status GET:', error);
    return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 });
  }
}
