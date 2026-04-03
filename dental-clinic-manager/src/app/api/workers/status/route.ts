import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
      marketing?: { installed: boolean; online: boolean };
      scraping?: { online: boolean; workerCount: number };
    } = {};

    // 마케팅 워커 상태 (DB 기반 - Electron 워커가 heartbeat 업데이트)
    if (type === 'marketing' || type === 'all') {
      let installed = false;
      let online = false;
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: controlData } = await admin
          .from('marketing_worker_control')
          .select('watchdog_online, worker_running, last_updated')
          .eq('id', 'main')
          .single();

        if (controlData) {
          // 레코드가 존재하면 워커가 한 번이라도 등록된 것 (설치됨)
          installed = true;
          // last_updated가 60초 이내이고 watchdog_online이면 온라인
          const lastUpdated = controlData.last_updated ? new Date(controlData.last_updated) : null;
          const isRecent = lastUpdated && (Date.now() - lastUpdated.getTime() < 60_000);
          online = !!(controlData.watchdog_online && isRecent);
        }
      }
      result.marketing = { installed, online };
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
