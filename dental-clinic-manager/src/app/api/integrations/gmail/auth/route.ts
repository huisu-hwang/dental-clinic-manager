import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/integrations/gmail/auth
 * Google OAuth2 인증 시작 - clinicId를 받아 Google OAuth2 URL로 리다이렉트
 */
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const loginHint = searchParams.get('loginHint');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      console.error('[gmail/auth] GOOGLE_CLIENT_ID 또는 GOOGLE_REDIRECT_URI가 설정되지 않았습니다.');
      return NextResponse.json({ error: 'Google OAuth 설정이 완료되지 않았습니다.' }, { status: 500 });
    }

    const state = JSON.stringify({ clinicId, userId: user.id });
    const stateEncoded = Buffer.from(state).toString('base64url');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', stateEncoded);
    if (loginHint) {
      authUrl.searchParams.set('login_hint', loginHint);
    }

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[gmail/auth]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
