import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import { decrypt } from '@/lib/email/encryption';
import { refreshToken, getNewMails } from '@/lib/email/gmail-client';
import type { GmailMessage } from '@/lib/email/gmail-client';

/**
 * POST /api/marketing/worker-api/email/check
 * 새 메일 조회 - Worker API Key 인증
 * provider='gmail': Gmail API로 메일 조회 + 발신자 필터링
 * provider='naver': 암호화된 자격증명 복호화하여 반환 (워커가 IMAP 직접)
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { clinicId } = body as { clinicId?: string };

    // 활성 이메일 연동 조회
    let query = admin
      .from('clinic_email_integrations')
      .select('*')
      .eq('is_active', true);

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    const { data: integrations, error: fetchError } = await query;

    if (fetchError) {
      console.error('[worker-api/email/check] DB fetch error:', fetchError);
      return NextResponse.json({ error: 'DB fetch failed' }, { status: 500 });
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = [];

    for (const integration of integrations) {
      try {
        if (integration.provider === 'gmail') {
          const result = await handleGmailCheck(admin, integration);
          results.push(result);
        } else if (integration.provider === 'naver') {
          const result = handleNaverCheck(integration);
          results.push(result);
        }
      } catch (err) {
        console.error(`[worker-api/email/check] Error for clinic ${integration.clinic_id}:`, err);
        results.push({
          clinicId: integration.clinic_id,
          provider: integration.provider,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[worker-api/email/check]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleGmailCheck(
  admin: NonNullable<Awaited<ReturnType<typeof verifyWorkerApiKey>>>,
  integration: Record<string, unknown>
) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth 환경변수 누락');
  }

  // refresh token으로 access token 갱신
  const decryptedRefreshToken = decrypt(integration.refresh_token_encrypted as string);
  const tokenData = await refreshToken(clientId, clientSecret, decryptedRefreshToken);

  // 갱신된 access token 저장
  const { encrypt: encryptFn } = await import('@/lib/email/encryption');
  const encryptedAccessToken = encryptFn(tokenData.access_token);

  await admin
    .from('clinic_email_integrations')
    .update({
      access_token_encrypted: encryptedAccessToken,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('clinic_id', integration.clinic_id as string)
    .eq('provider', 'gmail');

  // 발신자 필터 조회
  const { data: settings } = await admin
    .from('clinic_email_settings')
    .select('sender_filters, last_checked_at')
    .eq('clinic_id', integration.clinic_id as string)
    .maybeSingle();

  const senderFilters: string[] = (settings?.sender_filters as string[]) || [];
  const lastCheckedAt = settings?.last_checked_at
    ? new Date(settings.last_checked_at as string)
    : new Date(Date.now() - 24 * 60 * 60 * 1000); // 기본: 24시간 전

  // Gmail API로 메일 조회
  const mails = await getNewMails(tokenData.access_token, lastCheckedAt, senderFilters);

  // 메일 정보 파싱
  const parsedMails = mails.map((mail: GmailMessage) => {
    const headers = mail.payload.headers;
    const getHeaderValue = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // 첨부파일 목록 추출
    const attachments: { filename: string; mimeType: string; attachmentId: string }[] = [];
    function walkParts(parts?: GmailMessage['payload']['parts']) {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
          });
        }
        if (part.parts) walkParts(part.parts);
      }
    }
    walkParts(mail.payload.parts);

    return {
      id: mail.id,
      subject: getHeaderValue('Subject'),
      from: getHeaderValue('From'),
      date: getHeaderValue('Date'),
      snippet: mail.snippet,
      attachments,
    };
  });

  return {
    clinicId: integration.clinic_id,
    provider: 'gmail',
    mails: parsedMails,
    settings: {
      senderFilters,
      lastCheckedAt: lastCheckedAt.toISOString(),
    },
  };
}

function handleNaverCheck(integration: Record<string, unknown>) {
  // 네이버: 암호화된 자격증명 복호화하여 반환 (워커가 IMAP 직접)
  const decryptedPassword = decrypt(integration.password_encrypted as string);

  return {
    clinicId: integration.clinic_id,
    provider: 'naver',
    credentials: {
      email: integration.email_address as string,
      password: decryptedPassword,
    },
    settings: {
      lastCheckedAt: (integration.last_checked_at as string) || null,
    },
  };
}
