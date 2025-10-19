const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function finalizeAdmin() {
  console.log('Admin 계정 최종 설정...\n');

  try {
    // admin@dentalmanager.com으로 로그인
    console.log('admin@dentalmanager.com으로 로그인 중...');
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'admin@dentalmanager.com',
      password: 'temp123456'
    });

    if (loginError) {
      console.error('로그인 실패:', loginError.message);
      console.log('\n이메일 확인이 필요할 수 있습니다.');
      console.log('admin@dentalmanager.com으로 전송된 확인 이메일을 체크하세요.');
      return;
    }

    console.log('✅ 로그인 성공!');
    const userId = loginData.user.id;

    // 비밀번호를 123456으로 변경
    console.log('\n비밀번호를 123456으로 변경 중...');
    const { error: pwdError } = await supabase.auth.updateUser({
      password: '123456'
    });

    if (pwdError) {
      console.error('비밀번호 변경 실패:', pwdError.message);
    } else {
      console.log('✅ 비밀번호 변경 완료!');
    }

    // 병원 정보 생성
    console.log('\n병원 정보 생성 중...');
    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .insert({
        name: '덴탈 매니저 병원',
        owner_name: 'Admin',
        address: '서울시 강남구',
        phone: '02-1234-5678',
        email: 'admin@dentalmanager.com',
        is_public: false
      })
      .select()
      .single();

    if (clinicError) {
      console.log('병원 생성 오류 (이미 존재할 수 있음):', clinicError.message);

      // 기존 병원 조회
      const { data: existingClinic } = await supabase
        .from('clinics')
        .select('*')
        .eq('email', 'admin@dentalmanager.com')
        .single();

      if (existingClinic) {
        console.log('기존 병원 사용:', existingClinic.id);
        var clinicId = existingClinic.id;
      }
    } else {
      console.log('✅ 병원 생성 완료!');
      var clinicId = clinicData.id;
    }

    // users 테이블에 정보 추가
    console.log('\nusers 테이블 업데이트 중...');
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: 'admin@dentalmanager.com',
        name: 'Admin',
        role: 'owner',
        clinic_id: clinicId || null
      });

    if (userError) {
      console.log('users 테이블 오류 (이미 존재할 수 있음):', userError.message);
    } else {
      console.log('✅ users 테이블 업데이트 완료!');
    }

    await supabase.auth.signOut();

    console.log('\n========================================');
    console.log('Admin 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일: admin@dentalmanager.com');
    console.log('비밀번호: 123456');
    console.log('========================================');
    console.log('\n참고: sani81@gmail.com으로 이메일을 변경하려면');
    console.log('Supabase 대시보드에서 직접 변경하거나');
    console.log('admin@dentalmanager.com으로 사용하세요.');
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

finalizeAdmin();