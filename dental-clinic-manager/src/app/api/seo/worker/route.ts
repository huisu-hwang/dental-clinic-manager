import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function checkAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWorkerOnline(w: any): boolean {
  if (w.status === 'offline') return false;
  const lastBeat = new Date(w.last_heartbeat);
  return Date.now() - lastBeat.getTime() < 2 * 60 * 1000;
}

// GET: SEO 워커 상태 조회
export async function GET() {
  try {
    const user = await checkAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    const { data: workers } = await admin
      .from('seo_workers')
      .select('*')
      .order('last_heartbeat', { ascending: false });

    const { count: pendingJobsCount } = await admin
      .from('seo_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'running']);

    const { data: recentJobs } = await admin
      .from('seo_jobs')
      .select('id, job_type, status, params, created_at, completed_at, error_message')
      .order('created_at', { ascending: false })
      .limit(10);

    const workerList = workers || [];
    const onlineWorkers = workerList.filter(isWorkerOnline);

    return NextResponse.json({
      workers: workerList,
      onlineCount: onlineWorkers.length,
      isOnline: onlineWorkers.length > 0,
      pendingJobsCount: pendingJobsCount || 0,
      recentJobs: recentJobs || [],
    });

  } catch (err) {
    console.error('[SEO Worker Status] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 워커 제어 (중지 요청)
export async function POST() {
  try {
    const user = await checkAuth();
    if (!user) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin 클라이언트 초기화 실패' }, { status: 500 });

    // 모든 온라인 워커에 중지 요청
    const { error } = await admin
      .from('seo_workers')
      .update({ stop_requested: true })
      .neq('status', 'offline');

    if (error) {
      return NextResponse.json({ error: `워커 중지 요청 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '워커 중지 요청을 전송했습니다.' });

  } catch (err) {
    console.error('[SEO Worker Control] Error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
