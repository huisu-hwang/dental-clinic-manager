import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

// GET: 통합 워커가 DentWeb 동기화 설정을 조회
// 설정이 없으면 자동 생성 (api_key 포함)
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // dentweb_sync_config에서 활성 설정 조회
    let { data: config } = await admin
      .from('dentweb_sync_config')
      .select('clinic_id, api_key, is_active, sync_interval_seconds')
      .limit(1)
      .single();

    // 설정이 없으면 clinic을 찾아서 자동 생성
    if (!config) {
      // users 테이블에서 첫 번째 clinic_id 조회
      const { data: firstUser } = await admin
        .from('users')
        .select('clinic_id')
        .not('clinic_id', 'is', null)
        .limit(1)
        .single();

      if (!firstUser?.clinic_id) {
        return NextResponse.json({
          success: true,
          config: null,
          message: 'No clinic found',
        });
      }

      const apiKey = `dw_${crypto.randomUUID().replace(/-/g, '')}`;
      const { data: newConfig, error: insertError } = await admin
        .from('dentweb_sync_config')
        .insert({
          clinic_id: firstUser.clinic_id,
          is_active: true,
          api_key: apiKey,
          sync_interval_seconds: 300,
        })
        .select('clinic_id, api_key, is_active, sync_interval_seconds')
        .single();

      if (insertError) {
        console.error('[worker-api/dentweb/config] insert error:', insertError);
        return NextResponse.json({ error: 'Config creation failed' }, { status: 500 });
      }

      config = newConfig;
    }

    return NextResponse.json({
      success: true,
      config: {
        clinic_id: config!.clinic_id,
        api_key: config!.api_key,
        is_active: config!.is_active,
        sync_interval_seconds: config!.sync_interval_seconds,
      },
    });
  } catch (error) {
    console.error('[worker-api/dentweb/config GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
