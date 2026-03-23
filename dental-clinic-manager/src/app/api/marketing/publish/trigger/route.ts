import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 마케팅 워커 즉시 발행 트리거
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const workerUrl = process.env.MARKETING_WORKER_URL || 'http://localhost:4001';

    try {
      const res = await fetch(`${workerUrl}/trigger`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        return NextResponse.json({ ok: true, workerOnline: true });
      }
    } catch {
      // 워커가 실행 중이 아닌 경우 (정상 상황)
    }

    // 워커 미실행 - 스케줄러가 5분 내로 처리
    return NextResponse.json({
      ok: true,
      workerOnline: false,
      message: '발행 예약 완료. 마케팅 워커가 실행 중이면 곧 발행됩니다.',
    });
  } catch (error) {
    console.error('[API] publish/trigger:', error);
    return NextResponse.json({ error: '트리거 오류' }, { status: 500 });
  }
}
