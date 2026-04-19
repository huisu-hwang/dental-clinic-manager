import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import { decrypt } from '@/lib/email/encryption';
import { refreshToken, getAttachment } from '@/lib/email/gmail-client';

/**
 * POST /api/marketing/worker-api/email/attachment
 * Gmail 첨부파일 다운로드 - Worker API Key 인증
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId, mailId, attachmentId } = body as {
      clinicId: string;
      mailId: string;
      attachmentId: string;
    };

    if (!clinicId || !mailId || !attachmentId) {
      return NextResponse.json(
        { error: 'clinicId, mailId, attachmentId가 필요합니다.' },
        { status: 400 }
      );
    }

    // Gmail 연동 정보 조회
    const { data: integration, error: fetchError } = await admin
      .from('clinic_email_integrations')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('provider', 'gmail')
      .eq('is_active', true)
      .maybeSingle();

    if (fetchError || !integration) {
      return NextResponse.json({ error: 'Gmail 연동 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Google OAuth 환경변수 누락' }, { status: 500 });
    }

    // access token 갱신
    const decryptedRefreshToken = decrypt(integration.encrypted_refresh_token as string);
    const tokenData = await refreshToken(clientId, clientSecret, decryptedRefreshToken);

    // 첨부파일 다운로드
    const attachmentData = await getAttachment(tokenData.access_token, mailId, attachmentId);

    // base64url -> standard base64 변환
    const base64Standard = attachmentData.data
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    return NextResponse.json({
      data: base64Standard,
      size: attachmentData.size,
    });
  } catch (error) {
    console.error('[worker-api/email/attachment]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
