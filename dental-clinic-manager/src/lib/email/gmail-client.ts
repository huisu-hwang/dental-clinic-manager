/**
 * Gmail API 래퍼
 * googleapis 패키지 없이 fetch로 직접 호출
 * Base URL: https://gmail.googleapis.com/gmail/v1/users/me
 */

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: GmailMessagePart[];
    body?: { data?: string; attachmentId?: string; size: number };
    mimeType: string;
  };
  internalDate: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  body: { data?: string; attachmentId?: string; size: number };
  parts?: GmailMessagePart[];
}

export interface GmailAttachment {
  data: string; // base64url encoded
  size: number;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

/**
 * 새 메일 조회
 * @param accessToken - OAuth2 access token
 * @param after - 이 날짜 이후의 메일만 조회
 * @param senderEmails - 발신자 이메일 필터 (OR 조건)
 */
export async function getNewMails(
  accessToken: string,
  after: Date,
  senderEmails: string[]
): Promise<GmailMessage[]> {
  const afterSec = Math.floor(after.getTime() / 1000);
  const fromQuery = senderEmails.map((e) => `from:${e}`).join(' OR ');
  const query = `after:${afterSec}${fromQuery ? ` (${fromQuery})` : ''}`;

  const listUrl = new URL(`${GMAIL_BASE}/messages`);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', '50');

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail list messages 실패 (${listRes.status}): ${err}`);
  }

  const listData = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> };
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // 각 메시지 상세 조회 (병렬)
  const messages = await Promise.all(
    listData.messages.map(async (m) => {
      const msgRes = await fetch(`${GMAIL_BASE}/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!msgRes.ok) return null;
      return msgRes.json() as Promise<GmailMessage>;
    })
  );

  return messages.filter((m): m is GmailMessage => m !== null);
}

/**
 * 첨부파일 다운로드
 * @param accessToken - OAuth2 access token
 * @param messageId - 메시지 ID
 * @param attachmentId - 첨부파일 ID
 */
export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<GmailAttachment> {
  const res = await fetch(`${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail get attachment 실패 (${res.status}): ${err}`);
  }

  return res.json() as Promise<GmailAttachment>;
}

/**
 * OAuth2 토큰 갱신
 * @param clientId - Google OAuth2 Client ID
 * @param clientSecret - Google OAuth2 Client Secret
 * @param refreshToken - Refresh Token
 */
export async function refreshToken(
  clientId: string,
  clientSecret: string,
  refreshTokenValue: string
): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token refresh 실패 (${res.status}): ${err}`);
  }

  return res.json() as Promise<TokenResponse>;
}
