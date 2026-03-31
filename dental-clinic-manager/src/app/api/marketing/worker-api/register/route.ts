import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 워커 자동 등록 엔드포인트
// Electron 앱이 첫 실행 시 호출하여 API Key를 자동으로 받아감
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('marketing_worker_control')
      .select('worker_api_key')
      .eq('id', 'main')
      .single();

    if (error || !data?.worker_api_key) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      apiKey: data.worker_api_key,
      dashboardUrl: 'https://www.hi-clinic.co.kr',
    });
  } catch (error) {
    console.error('[worker-api/register]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
