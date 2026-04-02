import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/email/encryption';
import { validateNaverCredentials } from '@/lib/email/naver-client';

/**
 * POST /api/integrations/naver-mail/connect
 * 네이버 메일 연결 - 자격증명을 암호화하여 저장
 * 실제 IMAP 연결 테스트는 워커에서 수행 (Vercel에서 IMAP 불가)
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { clinicId, email, password } = body as {
      clinicId: string;
      email: string;
      password: string;
    };

    if (!clinicId || !email || !password) {
      return NextResponse.json(
        { error: 'clinicId, email, password가 필요합니다.' },
        { status: 400 }
      );
    }

    // 자격증명 형식 검증
    const validation = validateNaverCredentials(email, password);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 비밀번호 암호화
    const encryptedPassword = encrypt(password);

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // clinic_email_integrations에 저장 (upsert)
    const { error: upsertError } = await admin
      .from('clinic_email_integrations')
      .upsert(
        {
          clinic_id: clinicId,
          provider: 'naver',
          email_address: email,
          password_encrypted: encryptedPassword,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,provider' }
      );

    if (upsertError) {
      console.error('[naver-mail/connect] DB upsert error:', upsertError);
      return NextResponse.json(
        { error: '연결 정보 저장에 실패했습니다: ' + upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '네이버 메일 연결 정보가 저장되었습니다. 워커에서 연결 테스트가 수행됩니다.',
    });
  } catch (error) {
    console.error('[naver-mail/connect]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
