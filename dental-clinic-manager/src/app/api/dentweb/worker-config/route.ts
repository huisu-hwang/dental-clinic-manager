import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// GET: 통합 워커(Electron 앱)가 자신의 workerApiKey로 인증하여
// 덴트웹 브릿지 구동에 필요한 설정(clinic_id, api_key, 동기화 주기, 활성 여부)을
// 내려받는 엔드포인트.
//
// 이 엔드포인트는 DB 접속 정보(서버/계정/비밀번호)는 반환하지 않는다.
// DB 정보는 원내 PC의 로컬 설정(electron-store)에 남아 외부로 유출되지 않는다.
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 활성화된 덴트웹 동기화 설정 중 가장 최근에 업데이트된 1건 반환
    // (현재 시스템은 사실상 단일 clinic 운영이므로 첫 번째 활성 설정을 사용)
    const { data: config, error } = await admin
      .from('dentweb_sync_config')
      .select('clinic_id, api_key, sync_interval_seconds, is_active, updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[dentweb/worker-config] DB error:', error.message);
      return NextResponse.json(
        { success: false, error: '설정 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    if (!config || !config.api_key || !config.clinic_id) {
      return NextResponse.json(
        {
          success: false,
          error: '활성화된 덴트웹 동기화 설정을 찾을 수 없습니다. 대시보드에서 덴트웹 동기화를 먼저 활성화해주세요.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        clinic_id: config.clinic_id,
        api_key: config.api_key,
        sync_interval_seconds: config.sync_interval_seconds ?? 300,
        is_active: config.is_active,
      },
    });
  } catch (error) {
    console.error('[dentweb/worker-config] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
