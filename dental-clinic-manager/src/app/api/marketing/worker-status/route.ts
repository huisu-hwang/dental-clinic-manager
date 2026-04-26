import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 마케팅 워커 헬스 + 발행 지연 항목 요약
// - 마케팅 페이지 상단 배너에서 사용
// - watchdog_online + last_updated 60초 이내인 경우만 진짜 online으로 간주

const STALE_THRESHOLD_MS = 60_000;
const OVERDUE_THRESHOLD_MIN = 30; // publish_date + publish_time 기준 30분 이상 경과

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'DB 연결 오류' }, { status: 500 });
    }

    // 1. 워커 컨트롤 상태
    const { data: control } = await admin
      .from('marketing_worker_control')
      .select('watchdog_online, worker_running, last_updated, worker_version, update_status')
      .eq('id', 'main')
      .single();

    const lastUpdatedAt = control?.last_updated ? new Date(control.last_updated).getTime() : 0;
    const heartbeatAgeMs = lastUpdatedAt ? Date.now() - lastUpdatedAt : Number.POSITIVE_INFINITY;
    const workerOnline = !!(
      control?.watchdog_online &&
      lastUpdatedAt &&
      heartbeatAgeMs < STALE_THRESHOLD_MS
    );

    // 2. 발행 지연 항목: status가 scheduled 또는 publishing 인데 publish_date/time이 30분+ 지남 (KST 비교)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentDate = kst.toISOString().split('T')[0];
    const overdueCutoff = new Date(kst.getTime() - OVERDUE_THRESHOLD_MIN * 60 * 1000);
    const overdueTimeOnSameDay = overdueCutoff.toISOString().split('T')[1].slice(0, 5);

    // 과거 날짜 항목
    const { data: pastDays } = await admin
      .from('content_calendar_items')
      .select('id, title, publish_date, publish_time, status')
      .in('status', ['scheduled', 'publishing'])
      .lt('publish_date', currentDate)
      .order('publish_date', { ascending: true })
      .limit(20);

    // 오늘 날짜이지만 시간이 30분 이상 지난 항목
    const { data: todayOverdue } = await admin
      .from('content_calendar_items')
      .select('id, title, publish_date, publish_time, status')
      .in('status', ['scheduled', 'publishing'])
      .eq('publish_date', currentDate)
      .lte('publish_time', overdueTimeOnSameDay)
      .order('publish_time', { ascending: true })
      .limit(20);

    const overdueItems = [...(pastDays || []), ...(todayOverdue || [])];

    // 3. 최근 24시간 실패 항목
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFailures } = await admin
      .from('content_calendar_items')
      .select('id, title, fail_reason, updated_at')
      .eq('status', 'failed')
      .gte('updated_at', last24h)
      .order('updated_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      worker: {
        online: workerOnline,
        running: !!control?.worker_running,
        version: control?.worker_version || null,
        lastUpdatedAt: control?.last_updated || null,
        heartbeatAgeSeconds: Number.isFinite(heartbeatAgeMs) ? Math.round(heartbeatAgeMs / 1000) : null,
        updateStatus: control?.update_status || null,
      },
      overdue: {
        count: overdueItems.length,
        items: overdueItems.map((i) => ({
          id: i.id,
          title: i.title,
          publishDate: i.publish_date,
          publishTime: i.publish_time,
          status: i.status,
        })),
      },
      recentFailures: (recentFailures || []).map((f) => ({
        id: f.id,
        title: f.title,
        failReason: (f.fail_reason || '').slice(0, 300),
        updatedAt: f.updated_at,
      })),
    });
  } catch (error) {
    console.error('[API] marketing/worker-status:', error);
    return NextResponse.json({ error: '상태 조회 오류' }, { status: 500 });
  }
}
