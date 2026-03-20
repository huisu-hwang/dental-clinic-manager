import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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

// 워커 온라인 여부 판단 (last_heartbeat 2분 이내 + status != offline)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWorkerOnline(w: any): boolean {
  if (w.status === 'offline') return false;
  const lastBeat = new Date(w.last_heartbeat);
  return Date.now() - lastBeat.getTime() < 2 * 60 * 1000;
}

// GET: 스크래핑 워커 상태 조회
export async function GET() {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // scraping_workers 조회
    const { data: workers } = await admin
      .from('scraping_workers')
      .select('*')
      .order('last_heartbeat', { ascending: false });

    // 대기/실행 중인 jobs 수
    const { count: pendingJobsCount } = await admin
      .from('scraping_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'running']);

    // 최근 jobs (10개)
    const { data: recentJobs } = await admin
      .from('scraping_jobs')
      .select('id, clinic_id, status, data_types, created_at, completed_at, error_message')
      .order('created_at', { ascending: false })
      .limit(10);

    const workerList = workers || [];
    const onlineWorkers = workerList.filter(isWorkerOnline);

    return NextResponse.json({
      workers: workerList,
      onlineCount: onlineWorkers.length,
      pendingJobsCount: pendingJobsCount || 0,
      recentJobs: recentJobs || [],
    });
  } catch (error) {
    console.error('[API] master/scraping-worker GET:', error);
    return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 });
  }
}

// POST: 워커 시작 / 중지
export async function POST(request: NextRequest) {
  try {
    const user = await checkMasterAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // ─── 중지 ───
    if (action === 'stop') {
      const { error } = await admin
        .from('scraping_workers')
        .update({ stop_requested: true })
        .neq('status', 'offline');

      if (error) {
        return NextResponse.json({ ok: false, message: '중지 요청 실패: ' + error.message });
      }
      return NextResponse.json({ ok: true, message: '워커에 중지 요청을 보냈습니다. 다음 heartbeat(최대 30초) 후 중지됩니다.' });
    }

    // ─── 시작 ───
    if (action === 'start') {
      // Vercel 환경에서는 프로세스 실행 불가
      if (process.env.VERCEL || process.env.VERCEL_ENV) {
        return NextResponse.json({
          ok: false,
          message: 'Vercel 환경에서는 워커를 원격으로 시작할 수 없습니다.',
          manualCommand: 'cd scraping-worker && npm start',
        });
      }

      // stop_requested 초기화
      await admin
        .from('scraping_workers')
        .update({ stop_requested: false })
        .not('id', 'is', null);

      // 이미 실행 중인지 확인
      const { data: workers } = await admin
        .from('scraping_workers')
        .select('last_heartbeat, status')
        .order('last_heartbeat', { ascending: false })
        .limit(1);

      if (workers && workers.length > 0 && isWorkerOnline(workers[0])) {
        return NextResponse.json({ ok: true, message: '워커가 이미 실행 중입니다.' });
      }

      // 프로세스 시작
      try {
        const { spawn } = await import('child_process');
        const path = await import('path');
        const workerDir = path.join(process.cwd(), 'scraping-worker');

        const child = spawn('npm', ['start'], {
          cwd: workerDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env },
        });
        child.unref();

        return NextResponse.json({ ok: true, message: '워커 시작 요청을 보냈습니다. 잠시 후 상태를 확인하세요.' });
      } catch (err) {
        console.error('[API] 스크래핑 워커 시작 실패:', err);
        return NextResponse.json({
          ok: false,
          message: '워커 자동 시작에 실패했습니다.',
          manualCommand: 'cd scraping-worker && npm start',
        });
      }
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    console.error('[API] master/scraping-worker POST:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
