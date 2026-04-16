import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hometaxEncryptToJson } from '@/lib/hometaxCrypto';
import { requireAuth } from '@/lib/auth/requireAuth';

// POST: 홈택스 인증정보 등록/수정
export async function POST(request: NextRequest) {
  try {
    // 인증 검증 (owner, vice_director, manager만 허용)
    const auth = await requireAuth(['owner', 'vice_director', 'manager']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { clinicId, loginId, loginPw, businessNumber, residentNumber } = body;

    // 인증된 사용자의 clinic_id와 요청 clinic_id 일치 확인 (IDOR 방지)
    if (clinicId !== auth.user!.clinic_id) {
      return NextResponse.json({ error: '권한이 부족합니다.' }, { status: 403 });
    }

    if (!clinicId || !loginId || !businessNumber) {
      return NextResponse.json(
        { error: 'clinicId, loginId, businessNumber가 필요합니다.' },
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류: Admin 클라이언트 초기화 실패' }, { status: 500 });
    }

    // 기존 레코드 확인 (신규 등록 vs 수정 구분)
    const { data: existing } = await supabase
      .from('hometax_credentials')
      .select('id')
      .eq('clinic_id', clinicId)
      .single();

    const isNew = !existing;

    // 신규 등록 시 비밀번호, 주민등록번호 필수
    if (isNew && (!loginPw || !residentNumber)) {
      return NextResponse.json(
        { error: '신규 등록 시 비밀번호와 주민등록번호가 필요합니다.' },
        { status: 400 }
      );
    }

    // 주민등록번호 검증 (입력된 경우)
    const residentClean = residentNumber ? residentNumber.replace(/[^0-9]/g, '') : null;
    if (residentClean !== null && residentClean.length !== 7) {
      return NextResponse.json(
        { error: '주민등록번호는 생년월일 6자리 + 뒷자리 1자리 (총 7자리)를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 업서트 데이터 구성 (비밀번호/주민번호는 입력된 경우에만 업데이트)
    const upsertData: Record<string, unknown> = {
      clinic_id: clinicId,
      business_number: bizNoClean,
      hometax_user_id: loginId,
      login_method: 'id_pw',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (loginPw) {
      upsertData.encrypted_password = hometaxEncryptToJson(loginPw);
    }
    if (residentClean) {
      upsertData.encrypted_resident_number = hometaxEncryptToJson(residentClean);
    }

    const { data, error } = await supabase
      .from('hometax_credentials')
      .upsert(upsertData, { onConflict: 'clinic_id' })
      .select('id, clinic_id, business_number, login_method, is_active, last_login_success, last_login_attempt, last_login_error, created_at, updated_at')
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
    // 인증 검증
    const auth = await requireAuth();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    // 인증된 사용자의 clinic_id 확인 (IDOR 방지)
    if (clinicId !== auth.user!.clinic_id) {
      return NextResponse.json({ error: '권한이 부족합니다.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류: Admin 클라이언트 초기화 실패' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('hometax_credentials')
      .select('id, clinic_id, hometax_user_id, business_number, login_method, is_active, last_login_success, last_login_attempt, last_login_error, encrypted_resident_number, created_at, updated_at')
      .eq('clinic_id', clinicId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: '인증정보 조회에 실패했습니다.' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: true, data: null });
    }

    // 민감 정보는 반환하지 않고 존재 여부만 표시
    const { encrypted_resident_number, ...safeData } = data;
    return NextResponse.json({
      success: true,
      data: { ...safeData, has_resident_number: !!encrypted_resident_number },
    });
  } catch (error) {
    console.error('GET /api/hometax/credentials error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 홈택스 인증정보 삭제
export async function DELETE(request: NextRequest) {
  try {
    // 인증 검증 (owner, vice_director, manager만 허용)
    const auth = await requireAuth(['owner', 'vice_director', 'manager']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    // 인증된 사용자의 clinic_id 확인 (IDOR 방지)
    if (clinicId !== auth.user!.clinic_id) {
      return NextResponse.json({ error: '권한이 부족합니다.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류: Admin 클라이언트 초기화 실패' }, { status: 500 });
    }

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
