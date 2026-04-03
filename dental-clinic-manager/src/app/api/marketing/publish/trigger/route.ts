import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 마케팅 워커 즉시 발행 트리거
// DB 시그널 방식으로 Electron 워커에 발행 요청
export async function POST() {
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

    // DB 시그널로 워커 시작 요청 (Electron 워커가 10초 내 감지)
    await admin
      .from('marketing_worker_control')
      .update({ start_requested: true })
      .eq('id', 'main');

    // 워커 온라인 상태 확인
    const { data: controlData } = await admin
      .from('marketing_worker_control')
      .select('watchdog_online, worker_running, last_updated')
      .eq('id', 'main')
      .single();

    const isOnline = controlData?.watchdog_online &&
      controlData?.last_updated &&
      (Date.now() - new Date(controlData.last_updated).getTime() < 60_000);

    return NextResponse.json({
      ok: true,
      workerOnline: isOnline || false,
      message: isOnline
        ? '발행 요청 완료. 워커가 곧 처리합니다.'
        : '발행 요청 완료. 워커가 오프라인 상태입니다. Electron 워커를 실행해주세요.',
    });
  } catch (error) {
    console.error('[API] publish/trigger:', error);
    return NextResponse.json({ error: '트리거 오류' }, { status: 500 });
  }
}
