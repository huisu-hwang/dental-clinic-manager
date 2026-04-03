import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Electron 워커는 DB 상태로 관리 (HTTP 직접 연결 불필요)
const WORKER_URL = process.env.MARKETING_WORKER_URL || '';

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

    // 1. DB에서 워커 상태 조회 (Electron 워커는 DB 상태가 기준)
    const admin = getSupabaseAdmin();
    let workerOnline = false;
    let supervisorOnline = false;
    let headless = false;
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
      // 워커 상태 확인 (DB 기반 - Electron 워커가 10초마다 업데이트)
      const { data: controlData } = await admin
        .from('marketing_worker_control')
        .select('watchdog_online, worker_running, last_updated, headless')
        .eq('id', 'main')
        .single();

      if (controlData) {
        headless = controlData.headless || false;
        // last_updated가 60초 이내이고 watchdog_online이면 온라인
        const lastUpdated = controlData.last_updated ? new Date(controlData.last_updated) : null;
        const isRecent = lastUpdated && (Date.now() - lastUpdated.getTime() < 60_000);
        supervisorOnline = !!(controlData.watchdog_online && isRecent);
        workerOnline = !!(controlData.worker_running && isRecent);
      }

      // HTTP 헬스체크는 WORKER_URL이 설정된 경우에만 보조적으로 사용
      if (!workerOnline && WORKER_URL) {
        try {
          const res = await fetch(`${WORKER_URL}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) workerOnline = true;
        } catch {
          // HTTP 실패 → DB 상태만 사용
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
      headless,
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
      // DB 시그널로 워커 시작 요청 (Electron 워커가 10초 내 감지)
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin
          .from('marketing_worker_control')
          .update({ start_requested: true })
          .eq('id', 'main');

        // 워커 온라인 상태 확인
        const { data: controlData } = await admin
          .from('marketing_worker_control')
          .select('watchdog_online, last_updated')
          .eq('id', 'main')
          .single();

        const isOnline = controlData?.watchdog_online &&
          controlData?.last_updated &&
          (Date.now() - new Date(controlData.last_updated).getTime() < 60_000);

        return NextResponse.json({
          ok: true,
          workerOnline: isOnline || false,
          message: isOnline
            ? '발행 요청을 보냈습니다. 워커가 곧 처리합니다.'
            : '발행 요청을 보냈습니다. 워커가 오프라인 상태입니다.',
        });
      }

      return NextResponse.json({
        ok: true,
        workerOnline: false,
        message: '발행 요청을 보냈습니다. 워커가 실행 중이면 곧 처리됩니다.',
      });
    }

    if (action === 'stop') {
      // DB 시그널로 중지 요청 (Electron 워커가 10초 내 감지)
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
      // DB 시그널로 시작 요청 (Electron 워커가 감지)
      const admin = getSupabaseAdmin();
      if (admin) {
        // 워커가 온라인인지 확인
        const { data: controlData } = await admin
          .from('marketing_worker_control')
          .select('watchdog_online, worker_running, last_updated')
          .eq('id', 'main')
          .single();

        const isRecent = controlData?.last_updated &&
          (Date.now() - new Date(controlData.last_updated).getTime() < 60_000);
        const isOnline = controlData?.watchdog_online && isRecent;

        if (controlData?.worker_running && isRecent) {
          return NextResponse.json({ ok: true, message: '워커가 이미 실행 중입니다.' });
        }

        if (!isOnline) {
          return NextResponse.json({
            ok: false,
            message: '워커가 오프라인 상태입니다. PC에서 클리닉 매니저 워커 앱을 실행해주세요.',
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

    if (action === 'updateSettings') {
      const admin = getSupabaseAdmin();
      if (admin) {
        const update: Record<string, unknown> = {};
        if (body.headless !== undefined) update.headless = body.headless;
        if (Object.keys(update).length > 0) {
          await admin.from('marketing_worker_control').update(update).eq('id', 'main');
          return NextResponse.json({ ok: true, message: '설정이 저장되었습니다.' });
        }
      }
      return NextResponse.json({ ok: false, message: '설정 저장 실패' });
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    console.error('[API] master/worker POST:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
