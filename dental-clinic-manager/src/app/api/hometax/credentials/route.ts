import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hometaxEncryptToJson } from '@/lib/hometaxCrypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST: 홈택스 인증정보 등록/수정
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinicId, loginId, loginPw, businessNumber } = body;

    if (!clinicId || !loginId || !loginPw || !businessNumber) {
      return NextResponse.json(
        { error: 'clinicId, loginId, loginPw, businessNumber가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사업자번호 형식 검증 (XXX-XX-XXXXX)
    const bizNoClean = businessNumber.replace(/[^0-9]/g, '');
    if (bizNoClean.length !== 10) {
      return NextResponse.json(
        { error: '올바른 사업자등록번호를 입력해주세요. (10자리)' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 비밀번호 암호화 (로그인 ID는 평문 저장)
    const encryptedPw = hometaxEncryptToJson(loginPw);

    const { data, error } = await supabase
      .from('hometax_credentials')
      .upsert({
        clinic_id: clinicId,
        business_number: bizNoClean,
        hometax_user_id: loginId,
        encrypted_password: encryptedPw,
        login_method: 'id_pw',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'clinic_id' })
      .select('id, clinic_id, business_number, login_method, is_active, last_login_success, created_at, updated_at')
      .single();

    if (error) {
      console.error('홈택스 인증정보 저장 실패:', error);
      return NextResponse.json({ error: '인증정보 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('POST /api/hometax/credentials error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// GET: 홈택스 인증정보 조회 (비밀번호 제외)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('hometax_credentials')
      .select('id, clinic_id, business_number, login_method, is_active, last_login_success, last_login_error, created_at, updated_at')
      .eq('clinic_id', clinicId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: '인증정보 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || null });
  } catch (error) {
    console.error('GET /api/hometax/credentials error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 홈택스 인증정보 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from('hometax_credentials')
      .delete()
      .eq('clinic_id', clinicId);

    if (error) {
      return NextResponse.json({ error: '인증정보 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/hometax/credentials error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
