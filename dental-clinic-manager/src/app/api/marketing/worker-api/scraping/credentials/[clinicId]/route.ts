import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
}

function decrypt(encryptedJson: string, hexKey: string): string {
  const data: EncryptedData = JSON.parse(encryptedJson);
  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET: 클리닉의 홈택스 인증정보 (서버에서 복호화하여 전달)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clinicId } = await params;

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      console.error('[worker-api/scraping/credentials] ENCRYPTION_KEY not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data: cred, error } = await admin
      .from('hometax_credentials')
      .select('user_id, password_encrypted, resident_number_encrypted, session_data, session_expires_at')
      .eq('clinic_id', clinicId)
      .single();

    if (error || !cred) {
      return NextResponse.json({ error: 'Credentials not found' }, { status: 404 });
    }

    // 비밀번호 복호화
    let password: string;
    try {
      password = decrypt(cred.password_encrypted, encryptionKey);
    } catch (e) {
      console.error('[worker-api/scraping/credentials] password decrypt failed:', e);
      return NextResponse.json({ error: 'Decryption failed' }, { status: 500 });
    }

    // 주민등록번호 복호화 (있는 경우)
    let residentNumber: string | undefined;
    if (cred.resident_number_encrypted) {
      try {
        residentNumber = decrypt(cred.resident_number_encrypted, encryptionKey);
      } catch (e) {
        console.error('[worker-api/scraping/credentials] residentNumber decrypt failed:', e);
        // 복호화 실패해도 계속 진행 (선택 필드)
      }
    }

    return NextResponse.json({
      userId: cred.user_id,
      password,
      residentNumber,
      sessionData: cred.session_data ?? null,
      sessionExpiresAt: cred.session_expires_at ?? null,
    });
  } catch (error) {
    console.error('[worker-api/scraping/credentials GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
