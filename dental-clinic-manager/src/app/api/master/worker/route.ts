import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const WORKER_URL = process.env.MARKETING_WORKER_URL || 'http://localhost:3001';

// 마스터 권한 확인
async function checkMasterAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || !['master_admin', 'admin'].includes(userData.role)) return null;
  return user;
}

// 워커 상태 조회 + 예약된 글 수
export async function GET() {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    // 1. 워커 헬스 체크 (HTTP 직접 + DB 상태 병행)
    let workerOnline = false;
    try {
      const res = await fetch(`${WORKER_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      workerOnline = res.ok;
    } catch {
      workerOnline = false;
    }

    // 2. DB에서 supervisor/워커 상태 조회
    const admin = getSupabaseAdmin();
    let supervisorOnline = false;
    let pendingCount = 0;
    let publishedTodayCount = 0;
    let recentLogs: {
      id: string;
      platform: string;
      status: string;
      published_url: string | null;
      error_message: string | null;
      duration_seconds: number | null;
      published_at: string;
      item_id: string;
    }[] = [];

    if (admin) {
      // supervisor 상태 확인
      const { data: controlData } = await admin
        .from('marketing_worker_control')
        .select('watchdog_online, worker_running, last_updated')
        .eq('id', 'main')
        .single();

      if (controlData) {
        supervisorOnline = controlData.watchdog_online || false;
        // HTTP 헬스체크 실패 시 DB 상태도 참고
        if (!workerOnline && controlData.worker_running) {
          // DB에서는 실행 중이라고 하지만 HTTP 응답 없음 → 시작 중이거나 포트 미응답
          // last_updated가 30초 이내면 실행 중으로 간주
          const lastUpdated = new Date(controlData.last_updated);
          if (Date.now() - lastUpdated.getTime() < 30_000) {
            workerOnline = true;
          }
        }
      }

      const today = new Date().toISOString().split('T')[0];

      const { count } = await admin
        .from('content_calendar_items')
        .select('*', { count: 'exact', head: true })
        .in('status', ['scheduled', 'approved'])
        .lte('publish_date', today);
      pendingCount = count || 0;

      const { count: todayCount } = await admin
        .from('content_calendar_items')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('publish_date', today);
      publishedTodayCount = todayCount || 0;

      const { data: logs } = await admin
        .from('content_publish_logs')
        .select('id, platform, status, published_url, error_message, duration_seconds, published_at, item_id')
        .order('published_at', { ascending: false })
        .limit(10);
      recentLogs = logs || [];
    }

    return NextResponse.json({
      workerOnline,
      supervisorOnline,
      workerUrl: WORKER_URL,
      pendingCount,
      publishedTodayCount,
      recentLogs,
    });
  } catch (error) {
    console.error('[API] master/worker GET:', error);
    return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 });
  }
}

// 워커 제어 (시작/중지/트리거)
export async function POST(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'trigger';

    if (action === 'trigger') {
      try {
        const res = await fetch(`${WORKER_URL}/trigger`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          return NextResponse.json({ ok: true, workerOnline: true, message: '즉시 처리를 시작했습니다.' });
        }
      } catch {
        // 워커 미실행
      }
      return NextResponse.json({
        ok: false,
        workerOnline: false,
        message: '워커가 실행 중이 아닙니다. 워커를 먼저 시작해주세요.',
      });
    }

    if (action === 'stop') {
      // 1차: HTTP로 직접 중지 시도
      try {
        const res = await fetch(`${WORKER_URL}/stop`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          return NextResponse.json({ ok: true, message: '워커를 중지했습니다.' });
        }
      } catch {
        // HTTP 실패 → DB 시그널링으로 폴백
      }

      // 2차: DB 시그널링으로 중지 요청
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin
          .from('marketing_worker_control')
          .update({ stop_requested: true })
          .eq('id', 'main');
        return NextResponse.json({ ok: true, message: '워커에 중지 요청을 보냈습니다. 잠시 후 중지됩니다.' });
      }

      return NextResponse.json({ ok: false, message: '워커 중지에 실패했습니다.' });
    }

    if (action === 'start') {
      // 이미 실행 중인지 헬스체크로 확인
      try {
        const healthRes = await fetch(`${WORKER_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (healthRes.ok) {
          return NextResponse.json({ ok: true, message: '워커가 이미 실행 중입니다.' });
        }
      } catch {
        // 워커 미실행 → 시작 진행
      }

      // DB 시그널링으로 시작 요청 (Vercel/로컬 모두 동작)
      const admin = getSupabaseAdmin();
      if (admin) {
        // supervisor가 온라인인지 확인
        const { data: controlData } = await admin
          .from('marketing_worker_control')
          .select('watchdog_online, last_updated')
          .eq('id', 'main')
          .single();

        const supervisorOnline = controlData?.watchdog_online &&
          controlData?.last_updated &&
          (Date.now() - new Date(controlData.last_updated).getTime() < 60_000);

        if (!supervisorOnline) {
          return NextResponse.json({
            ok: false,
            message: 'Supervisor가 실행 중이 아닙니다. 서버에서 supervisor를 먼저 시작해주세요.',
            manualCommand: 'cd marketing-worker && npm run supervisor',
          });
        }

        await admin
          .from('marketing_worker_control')
          .update({ start_requested: true })
          .eq('id', 'main');

        return NextResponse.json({
          ok: true,
          message: '워커 시작 요청을 보냈습니다. 약 10초 후 상태를 확인하세요.',
        });
      }

      return NextResponse.json({ ok: false, message: '시작 요청에 실패했습니다.' });
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    console.error('[API] master/worker POST:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
