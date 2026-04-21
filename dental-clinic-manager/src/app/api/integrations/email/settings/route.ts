import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/integrations/email/settings?clinicId=xxx
 * 이메일 연동 설정 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data, error } = await admin
      .from('clinic_email_integrations')
      .select('provider, email_address, is_active, lab_sender_emails, tax_office_sender_emails, last_checked_at')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (error) {
      console.error('[email/settings GET]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        data: {
          provider: null,
          emailAddress: null,
          isActive: false,
          labSenderEmails: [],
          taxOfficeSenderEmails: [],
          lastCheckedAt: null,
        },
      });
    }

    return NextResponse.json({
      data: {
        provider: data.provider,
        emailAddress: data.email_address,
        isActive: data.is_active,
        labSenderEmails: data.lab_sender_emails ?? [],
        taxOfficeSenderEmails: data.tax_office_sender_emails ?? [],
        lastCheckedAt: data.last_checked_at,
      },
    });
  } catch (err) {
    console.error('[email/settings GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * PUT /api/integrations/email/settings
 * 이메일 연동 설정 업데이트 (발신자 목록, 모니터링 활성화, 연동 해제)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { clinicId, labSenderEmails, taxOfficeSenderEmails, isActive, disconnect } = body as {
      clinicId: string;
      labSenderEmails?: string[];
      taxOfficeSenderEmails?: string[];
      isActive?: boolean;
      disconnect?: boolean;
    };

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (disconnect) {
      // 연동 해제: 레코드 삭제
      const { error } = await admin
        .from('clinic_email_integrations')
        .delete()
        .eq('clinic_id', clinicId);
      if (error) {
        console.error('[email/settings PUT disconnect]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: '연동이 해제되었습니다.' });
    }

    // 기존 레코드 확인 (OAuth 미연동이어도 발신자 목록은 저장 가능)
    const { data: existing } = await admin
      .from('clinic_email_integrations')
      .select('id, provider, email_address')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    const oauthConnected = !!existing?.email_address;
    // OAuth 미연동 상태라면 모니터링 활성화는 자동으로 false로 강제
    const effectiveIsActive = oauthConnected ? isActive : false;
    const monitoringBlocked = isActive === true && !oauthConnected;

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (labSenderEmails !== undefined) updatePayload.lab_sender_emails = labSenderEmails;
      if (taxOfficeSenderEmails !== undefined) updatePayload.tax_office_sender_emails = taxOfficeSenderEmails;
      if (effectiveIsActive !== undefined) updatePayload.is_active = effectiveIsActive;

      const { error } = await admin
        .from('clinic_email_integrations')
        .update(updatePayload)
        .eq('clinic_id', clinicId);

      if (error) {
        console.error('[email/settings PUT update]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // OAuth 미연동 상태 - 발신자 목록만 사전 저장 (email_address는 placeholder)
      const insertPayload: Record<string, unknown> = {
        clinic_id: clinicId,
        provider: 'gmail',
        email_address: '',
        is_active: false,
        lab_sender_emails: labSenderEmails ?? [],
        tax_office_sender_emails: taxOfficeSenderEmails ?? [],
      };

      const { error } = await admin
        .from('clinic_email_integrations')
        .insert(insertPayload);

      if (error) {
        console.error('[email/settings PUT insert]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: monitoringBlocked
        ? '설정이 저장되었습니다. (모니터링은 Gmail/네이버 메일 연동 완료 후 활성화됩니다)'
        : '설정이 저장되었습니다.',
      monitoringBlocked,
    });
  } catch (err) {
    console.error('[email/settings PUT]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
