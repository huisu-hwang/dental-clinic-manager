import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import { hometaxDecryptFromJson } from '@/lib/hometaxCrypto';

// GET: 클리닉의 홈택스 인증정보 (서버에서 복호화하여 전달)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { clinicId } = await params;

    const { data: cred, error } = await admin
      .from('hometax_credentials')
      .select('hometax_user_id, encrypted_password, encrypted_resident_number, business_number, login_method, is_active')
      .eq('clinic_id', clinicId)
      .single();

    if (error || !cred) {
      return NextResponse.json(
        { error: 'Credentials not found', detail: error?.message },
        { status: 404 }
      );
    }

    if (!cred.is_active) {
      return NextResponse.json({ error: 'Credentials inactive' }, { status: 403 });
    }

    // 비밀번호 복호화
    let password: string;
    try {
      password = hometaxDecryptFromJson(cred.encrypted_password);
    } catch (e) {
      console.error('[worker-api/scraping/credentials] password decrypt failed:', e);
      return NextResponse.json({ error: 'Decryption failed' }, { status: 500 });
    }

    // 주민등록번호 복호화 (있는 경우)
    let residentNumber: string | undefined;
    if (cred.encrypted_resident_number) {
      try {
        residentNumber = hometaxDecryptFromJson(cred.encrypted_resident_number);
      } catch (e) {
        console.error('[worker-api/scraping/credentials] residentNumber decrypt failed:', e);
        // 복호화 실패해도 계속 진행 (선택 필드)
      }
    }

    return NextResponse.json({
      userId: cred.hometax_user_id,
      password,
      residentNumber,
      businessNumber: cred.business_number,
      loginMethod: cred.login_method,
    });
  } catch (error) {
    console.error('[worker-api/scraping/credentials GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
