import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 마케팅 워커 즉시 발행 트리거
// DB 시그널 방식 (유저 PC/서버 어디서든 동작) + HTTP 폴백
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 1차: DB 시그널로 워커 시작 요청 (유저 PC에서도 동작)
    const admin = getSupabaseAdmin();
    if (admin) {
      await admin
        .from('marketing_worker_control')
        .update({ start_requested: true })
        .eq('id', 'main');
    }

    // 2차: HTTP 직접 트리거 시도 (같은 서버에서 실행 중인 경우)
    const workerUrl = process.env.MARKETING_WORKER_URL;
    if (workerUrl) {
      try {
        const res = await fetch(`${workerUrl}/trigger`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          return NextResponse.json({ ok: true, workerOnline: true });
        }
      } catch {
        // 워커가 같은 서버에 없는 경우 (유저 PC에서 실행 중) - 정상
      }
    }

    return NextResponse.json({
      ok: true,
      workerOnline: false,
      message: '발행 요청 완료. 워커가 실행 중이면 곧 발행됩니다.',
    });
  } catch (error) {
    console.error('[API] publish/trigger:', error);
    return NextResponse.json({ error: '트리거 오류' }, { status: 500 });
  }
}
