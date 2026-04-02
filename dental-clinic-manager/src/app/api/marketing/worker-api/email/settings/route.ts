import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

/**
 * GET /api/marketing/worker-api/email/settings
 * 이메일 설정 조회 - Worker API Key 인증
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    // 이메일 연동 정보 조회
    const { data: integrations, error: intError } = await admin
      .from('clinic_email_integrations')
      .select('clinic_id, provider, email_address, is_active, last_checked_at, updated_at')
      .eq('clinic_id', clinicId);

    if (intError) {
      console.error('[worker-api/email/settings] Integration fetch error:', intError);
      return NextResponse.json({ error: 'DB fetch failed' }, { status: 500 });
    }

    // 이메일 설정 조회
    const { data: settings, error: settingsError } = await admin
      .from('clinic_email_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (settingsError) {
      console.error('[worker-api/email/settings] Settings fetch error:', settingsError);
    }

    return NextResponse.json({
      integrations: integrations || [],
      settings: settings || null,
    });
  } catch (error) {
    console.error('[worker-api/email/settings GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/marketing/worker-api/email/settings
 * 이메일 설정 업데이트 (last_checked_at, last_mail_id 등) - Worker API Key 인증
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, provider, last_checked_at, last_mail_id } = body as {
      clinicId: string;
      provider?: string;
      last_checked_at?: string;
      last_mail_id?: string;
    };

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    // clinic_email_integrations의 last_checked_at 업데이트
    if (last_checked_at && provider) {
      const { error: updateError } = await admin
        .from('clinic_email_integrations')
        .update({
          last_checked_at,
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_id', clinicId)
        .eq('provider', provider);

      if (updateError) {
        console.error('[worker-api/email/settings] Integration update error:', updateError);
        return NextResponse.json({ error: 'Update failed: ' + updateError.message }, { status: 500 });
      }
    }

    // clinic_email_settings upsert (last_mail_id 등)
    if (last_mail_id) {
      const { error: upsertError } = await admin
        .from('clinic_email_settings')
        .upsert(
          {
            clinic_id: clinicId,
            last_mail_id,
            last_checked_at: last_checked_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'clinic_id' }
        );

      if (upsertError) {
        console.error('[worker-api/email/settings] Settings upsert error:', upsertError);
        return NextResponse.json({ error: 'Settings update failed: ' + upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worker-api/email/settings POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
