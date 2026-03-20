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

    // 1. 워커 헬스 체크
    let workerOnline = false;
    try {
      const res = await fetch(`${WORKER_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      workerOnline = res.ok;
    } catch {
      workerOnline = false;
    }

    // 2. 예약된/대기 중인 글 수 조회
    const admin = getSupabaseAdmin();
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

// 즉시 발행 트리거
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
        message: '워커가 실행 중이 아닙니다. 서버에서 먼저 워커를 시작해주세요.',
      });
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    console.error('[API] master/worker POST:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
