import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/email/encryption';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/integrations/gmail/callback
 * Google OAuth2 콜백 - code를 토큰으로 교환하고 DB에 저장
 */
export async function GET(request: NextRequest) {
  const baseRedirect = '/dashboard/financial?tab=settings';

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[gmail/callback] OAuth error:', error);
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', error);
      return NextResponse.redirect(url.toString());
    }

    if (!code || !stateParam) {
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'missing_params');
      return NextResponse.redirect(url.toString());
    }

    // state 디코딩
    let clinicId: string;
    try {
      const stateJson = Buffer.from(stateParam, 'base64url').toString('utf8');
      const stateData = JSON.parse(stateJson);
      clinicId = stateData.clinicId;
    } catch {
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'invalid_state');
      return NextResponse.redirect(url.toString());
    }

    // 세션 인증 및 clinic 소유권 검증
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'unauthorized');
      return NextResponse.redirect(url.toString());
    }

    const adminClient = getSupabaseAdmin();
    if (adminClient) {
      const { data: userData } = await adminClient
        .from('users')
        .select('clinic_id')
        .eq('id', user.id)
        .single();

      if (!userData || userData.clinic_id !== clinicId) {
        const url = new URL(baseRedirect, request.url);
        url.searchParams.set('gmail_error', 'forbidden');
        return NextResponse.redirect(url.toString());
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[gmail/callback] Google OAuth 환경변수 누락');
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'server_config');
      return NextResponse.redirect(url.toString());
    }

    // code -> token 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[gmail/callback] Token exchange failed:', errText);
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'token_exchange');
      return NextResponse.redirect(url.toString());
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    };

    if (!tokenData.refresh_token) {
      console.error('[gmail/callback] No refresh_token received');
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'no_refresh_token');
      return NextResponse.redirect(url.toString());
    }

    // Gmail API로 이메일 주소 조회
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let emailAddress = '';
    if (profileRes.ok) {
      const profileData = await profileRes.json() as { emailAddress: string };
      emailAddress = profileData.emailAddress;
    }

    // 토큰 암호화
    const encryptedAccessToken = encrypt(tokenData.access_token);
    const encryptedRefreshToken = encrypt(tokenData.refresh_token);

    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[gmail/callback] Supabase Admin 클라이언트 생성 실패');
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'server_error');
      return NextResponse.redirect(url.toString());
    }

    // clinic_email_integrations에 저장 (unique constraint 없으므로 select 후 update/insert)
    const payload = {
      clinic_id: clinicId,
      provider: 'gmail' as const,
      email_address: emailAddress,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: existingRow } = await admin
      .from('clinic_email_integrations')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('provider', 'gmail')
      .maybeSingle();

    const saveResult = existingRow
      ? await admin
          .from('clinic_email_integrations')
          .update(payload)
          .eq('id', existingRow.id)
      : await admin.from('clinic_email_integrations').insert(payload);

    if (saveResult.error) {
      console.error('[gmail/callback] DB save error:', saveResult.error);
      const url = new URL(baseRedirect, request.url);
      url.searchParams.set('gmail_error', 'db_error');
      return NextResponse.redirect(url.toString());
    }

    const url = new URL(baseRedirect, request.url);
    url.searchParams.set('gmail_success', 'true');
    return NextResponse.redirect(url.toString());
  } catch (error) {
    console.error('[gmail/callback]', error);
    const url = new URL(baseRedirect, request.url);
    url.searchParams.set('gmail_error', 'unexpected');
    return NextResponse.redirect(url.toString());
  }
}
